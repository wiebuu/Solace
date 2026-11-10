import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SolToggle } from '@/components/SolToggle';
import { T, Tap } from '@/components/ui';
import { api, type HomeData } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { fonts, useTheme } from '@/lib/theme';
import { useReturnToSol, useSession } from '@/lib/session';
import { useAutoClose } from '@/lib/useAutoClose';
import { useVoiceCommands } from '@/lib/useVoiceCommands';
import { stopSpeaking } from '@/lib/voice';

const HOLD_MS = 3000;
const PRAISE = [
  'Beautifully said. You really mean it, and that matters.',
  'That was lovely. Let it sink in, you deserve every word.',
  'Very good. Saying it out loud takes courage, and you did it.',
  'Wonderful. I hope you felt that, because it’s true.',
];
const words = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
/** Did they say the affirmation? Enough of its words, in any order (speech-to-text isn't perfect). */
function saidIt(heard: string, affirmation: string) {
  const want = new Set(words(affirmation));
  const got = new Set(words(heard));
  let hit = 0;
  want.forEach((w) => got.has(w) && hit++);
  return want.size > 0 && (hit / want.size >= 0.4 || hit >= 4);
}

/** Today's affirmation, big and centred, read aloud by Sol (heard, not shown). Hold, or say you're ready. */
export default function Affirmation() {
  useReturnToSol();
  const insets = useSafeAreaInsets();
  const { colors, gradients } = useTheme();
  // One voice for the whole app: the page speaks through Sol, which keeps listening afterwards.
  const { speakHere: say, view } = useSession();
  const on = view !== 'closed';
  const [text, setText] = useState<string | null>(null);
  const [absorbed, setAbsorbed] = useState(false);
  const fill = useSharedValue(0);
  const autoClose = useAutoClose();

  useEffect(() => {
    api
      .get<HomeData>('/home')
      .then((h) => h.daily.affirmation)
      .catch(() => 'I am allowed to take up space and move at my own pace.')
      .then(setText);
    return () => stopSpeaking();
  }, []);
  // Sol reads it out only when it's on (now, or once the Sol button is tapped).
  useEffect(() => {
    if (on && text && !absorbed) say(`Here’s your affirmation for today. ${text}. Now say it out loud, slowly, like you mean it.`);
  }, [on, text]); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = () => {
    setAbsorbed(true);
    haptic.success();
    const praise = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    autoClose(say(`${praise} Now, what would you like to do next?`));
    api.post('/activities', { kind: 'affirmation', minutes: 1 }).catch(() => {});
  };
  const onIn = () => {
    if (absorbed) return;
    haptic.soft();
    fill.set(
      withTiming(1, { duration: HOLD_MS * (1 - fill.get()), easing: Easing.linear }, (ok) => {
        if (ok) runOnJS(complete)();
      }),
    );
  };
  const onOut = () => {
    if (absorbed) return;
    cancelAnimation(fill);
    fill.set(withTiming(0, { duration: 500 }));
  };
  // Out loud works too: "I'm ready", "read it again", "share", "close".
  useVoiceCommands((said) => {
    const t = said.toLowerCase();
    if (/\b(close|exit|quit|leave|stop|end|back)\b/.test(t)) return router.back(), true;
    if (/\b(again|repeat|read)\b/.test(t) && text) return say(text), true;
    if (/\bshare\b/.test(t) && text) return Share.share({ message: `“${text}” — from my day with Solace` }), true;
    // They said the affirmation itself (or close enough), or that they're done.
    if (!absorbed && ((text && saidIt(t, text)) || /\b(ready|done|yes|okay|ok|hold|absorb|breathe|i (did|have)|got it)\b/.test(t))) {
      fill.set(withTiming(1, { duration: 600 }, (ok) => ok && runOnJS(complete)()));
      return true;
    }
    return false;
  });

  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={gradients.deep} style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Tap onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.onDeep} />
        </Tap>
        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
          {text && (
            <Tap onPress={() => Share.share({ message: `“${text}” — from my day with Solace` })} hitSlop={12} accessibilityLabel="Share">
              <Ionicons name="share-outline" size={22} color={colors.onDeep} />
            </Tap>
          )}
          <SolToggle onDeep />
        </View>
      </View>
      <View style={styles.center}>
        {text && (
          <Animated.View entering={FadeIn.duration(900)} style={{ gap: 18 }}>
            <T variant="label" style={{ color: colors.onDeepSoft, textAlign: 'center' }}>Today’s affirmation</T>
            <T style={[styles.quote, { color: colors.onDeep }]} adjustsFontSizeToFit numberOfLines={7}>“{text}”</T>
          </Animated.View>
        )}
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 32 }]}>
        {absorbed ? (
          <Animated.View entering={FadeInDown} style={{ alignItems: 'center', gap: 8 }}>
            <T style={[styles.doneTitle, { color: colors.onDeep }]}>Carry it with you today</T>
          </Animated.View>
        ) : (
          <>
            <Pressable onPressIn={onIn} onPressOut={onOut} style={styles.hold} accessibilityRole="button" accessibilityLabel="Press and hold to breathe it in">
              <Animated.View style={[styles.holdFill, { backgroundColor: colors.primary }, bar]} />
              <T style={[styles.holdText, { color: colors.onDeep }]}>Press & hold to breathe it in</T>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 30 },
  // Big and centred, with room so the italic display type never clips.
  quote: { fontFamily: fonts.displayItalic, fontSize: 38, lineHeight: 52, textAlign: 'center' },
  bottom: { paddingHorizontal: 24, gap: 12, minHeight: 120, justifyContent: 'flex-end' },
  hold: { height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.6 },
  holdText: { fontFamily: fonts.bold, fontSize: 16 },
  doneTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 36, textAlign: 'center' },
});
