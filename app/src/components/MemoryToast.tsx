import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { T, Tap } from './ui';
import { useLatestRemembered } from '@/lib/memories';
import { fonts, shadow, useTheme } from '@/lib/theme';

const VERBS: Record<string, string> = { has: 'have', is: 'are', was: 'were', studies: 'study', does: 'do', goes: 'go' };
/** Memories are kept as "User has a dog"; say them to the person: "you have a dog". */
function toYou(text: string) {
  return text
    .replace(/^(the )?user'?s\s/i, 'your ')
    .replace(/^(the )?user\s+(\w+)/i, (_, __, v: string) => `you ${VERBS[v.toLowerCase()] ?? v.toLowerCase().replace(/s$/, '')}`);
}

/** "Sol will remember: …", shown for a few seconds the moment Sol saves something. Tap to see all. */
export function MemoryToast() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const latest = useLatestRemembered();
  const [shown, setShown] = useState<typeof latest | null>(null);
  useEffect(() => {
    if (!latest.length) return;
    const show = setTimeout(() => setShown(latest), 0);
    const hide = setTimeout(() => setShown(null), 4500);
    return () => (clearTimeout(show), clearTimeout(hide));
  }, [latest]);
  if (!shown) return null;
  return (
    <Animated.View entering={FadeInUp.duration(280)} exiting={FadeOutUp.duration(240)} style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Tap onPress={() => (setShown(null), router.push('/memories'))} scaleTo={0.98} style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.line }, shadow]} accessibilityLabel="See what Sol remembers">
        <Ionicons name="sparkles" size={16} color={colors.primary} />
        <T style={[styles.text, { color: colors.ink }]} numberOfLines={2}>
          <T style={[styles.label, { color: colors.primary }]}>Sol will remember </T>
          {shown.map((m) => toYou(m.text)).join(' · ')}
        </T>
      </Tap>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 90, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, maxWidth: 520, alignSelf: 'stretch' },
  text: { flex: 1, fontSize: 14, lineHeight: 19 },
  label: { fontFamily: fonts.bold },
});
