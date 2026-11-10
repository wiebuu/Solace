import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, View, type ViewStyle } from 'react-native';
import { Canvas, Points, vec, type SkPoint } from '@shopify/react-native-skia';
import Animated, { FadeIn, FadeOut, useDerivedValue, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from './ui';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

const GOLDEN = 2.39996323; // golden angle in radians: the ammonite / sunflower spiral

interface MarkProps {
  size?: number;
  /** 0..1: particles spiral in from the outside and settle (for the launch screen). */
  assemble?: SharedValue<number>;
  /** Rotation speed multiplier; 0 keeps it still. */
  spin?: number;
  /** One colour for every particle (e.g. white on a coloured button); otherwise the theme's. */
  tint?: string;
  style?: ViewStyle;
}

/**
 * The Solace mark: a circle of particles laid out on the golden-angle spiral, finer
 * at the heart and fuller at the rim. Used for the launch screen and loaders.
 */
export function SolMark({ size = 64, assemble, spin = 1, tint, style }: MarkProps) {
  const { orb } = useTheme();
  // Small marks use fewer, larger particles so the spiral stays legible.
  const count = size >= 160 ? 260 : size >= 60 ? 150 : 64;
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const t = useSharedValue(0);
  const spinSV = useSharedValue(spin);
  useEffect(() => {
    spinSV.value = withTiming(spin, { duration: 600 });
  }, [spin, spinSV]);

  useFrameCallback((f) => {
    t.value += (Math.min(f.timeSincePreviousFrame ?? 16, 50) / 1000) * spinSV.value;
  });

  const c = size / 2;
  const R = size * 0.44;

  const rings = useDerivedValue(() => {
    const a = assemble ? assemble.value : 1;
    const rot = t.value * 0.35;
    const breathe = 1 + 0.025 * Math.sin(t.value * 1.4);
    const out: SkPoint[][] = [[], [], [], []];
    for (let n = 0; n < seeds.length; n++) {
      const frac = Math.sqrt((n + 0.5) / seeds.length);
      // Stagger: inner particles arrive first, the rim last.
      const local = Math.min(1, Math.max(0, a * 1.6 - frac * 0.6));
      const e = 1 - Math.pow(1 - local, 3);
      const r = R * frac * breathe * (1 + (1 - e) * 1.4);
      const th = n * GOLDEN + rot + (1 - e) * 2.2;
      if (local <= 0) continue;
      const bucket = frac < 0.35 ? 0 : frac < 0.6 ? 1 : frac < 0.82 ? 2 : 3;
      out[bucket].push(vec(c + Math.cos(th) * r, c + Math.sin(th) * r));
    }
    return out;
  });
  const r0 = useDerivedValue(() => rings.value[0]);
  const r1 = useDerivedValue(() => rings.value[1]);
  const r2 = useDerivedValue(() => rings.value[2]);
  const r3 = useDerivedValue(() => rings.value[3]);
  const opacity = useDerivedValue(() => (assemble ? Math.min(1, assemble.value * 2) : 1));
  const d = Math.max(1.4, size * (size < 60 ? 0.045 : 0.022));

  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Canvas style={{ width: size, height: size }}>
        <Points points={r0} mode="points" color={tint ?? orb.particles[2]} strokeWidth={d * 0.7} strokeCap="round" opacity={opacity} />
        <Points points={r1} mode="points" color={tint ?? orb.particles[0]} strokeWidth={d * 0.95} strokeCap="round" opacity={opacity} />
        <Points points={r2} mode="points" color={tint ?? orb.particles[1]} strokeWidth={d * 1.15} strokeCap="round" opacity={opacity} />
        <Points points={r3} mode="points" color={tint ?? orb.particles[3]} strokeWidth={d * 1.3} strokeCap="round" opacity={opacity} />
      </Canvas>
    </View>
  );
}

/** Full-area loader for a screen's first load. */
export function PageLoader({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 }}>
      <ActivityIndicator color={colors.primary} />
      {label ? <T variant="caption">{label}</T> : null}
    </View>
  );
}

/**
 * Pull-to-refresh with a plain spinner in the theme's accent. iOS hides its own spinner as
 * the list springs back, so ours is pinned under the status bar until loading really ends.
 * Spread `scrollProps` onto a ScrollView / FlatList (it offsets the list below the status bar,
 * so screens don't add the top inset themselves) and render `indicator` above it.
 */
export function useSolRefresh(onRefresh: () => Promise<unknown>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const run = async () => {
    setRefreshing(true);
    const started = Date.now();
    try {
      await onRefresh();
    } finally {
      // Long enough to register, even when the server answers instantly.
      setTimeout(() => setRefreshing(false), Math.max(0, 700 - (Date.now() - started)));
    }
  };
  const indicator: ReactNode = refreshing ? (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(200)} pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, alignSelf: 'center', zIndex: 5 }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    </Animated.View>
  ) : null;
  return {
    refreshing,
    /** Refresh programmatically (e.g. when the active tab is tapped again). */
    trigger: () => {
      if (!refreshing) run();
    },
    indicator,
    scrollProps: {
      // Start the list below the status bar so the pull happens where people can see it.
      style: { marginTop: insets.top },
      refreshControl: (
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            // A tap the moment the pull is far enough, so people know they can let go.
            haptic.medium();
            run();
          }}
          tintColor="transparent"
          colors={['transparent']}
          progressBackgroundColor="transparent"
        />
      ),
    },
  };
}
