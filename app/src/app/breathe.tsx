import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SolToggle } from '@/components/SolToggle';
import { Button, Chip, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { fonts, useTheme } from '@/lib/theme';
import { useReturnToSol, useSession } from '@/lib/session';
import { useAutoClose } from '@/lib/useAutoClose';
import { useVoiceCommands } from '@/lib/useVoiceCommands';
import { playCue, prepareCues, stopSpeaking } from '@/lib/voice';

type Phase = { label: string; seconds: number; to: number };
const PATTERNS: { key: string; name: string; desc: string; phases: Phase[] }[] = [
  { key: 'calm', name: 'Calm', desc: 'Longer exhales slow your heart rate.', phases: [{ label: 'Breathe in', seconds: 4, to: 1 }, { label: 'Breathe out', seconds: 6, to: 0 }] },
  { key: 'box', name: 'Box', desc: 'Steady and focusing.', phases: [{ label: 'Breathe in', seconds: 4, to: 1 }, { label: 'Hold', seconds: 4, to: 1 }, { label: 'Breathe out', seconds: 4, to: 0 }, { label: 'Hold', seconds: 4, to: 0 }] },
  { key: 'sleep', name: '4-7-8', desc: 'A gentle wind-down before sleep.', phases: [{ label: 'Breathe in', seconds: 4, to: 1 }, { label: 'Hold', seconds: 7, to: 1 }, { label: 'Breathe out', seconds: 8, to: 0 }] },
];
const CUES = ['Breathe in', 'Hold', 'Breathe out'];
const DURATIONS = [1, 2, 3, 5];
const now = () => Date.now();

/** Guided breathing: big, calm type. Sol (heard, not shown) says each cue right on the beat. */
export default function Breathe() {
  useReturnToSol();
  const insets = useSafeAreaInsets();
  const { colors, gradients } = useTheme();
  // One voice for the whole app: the page speaks through Sol, which keeps listening afterwards.
  const { speakHere: say, voiceOptions, view } = useSession();
  // Sol speaks here only when it's on (the Sol button); the exercise works the same without it.
  const on = view !== 'closed';
  const onRef = useRef(on);
  useEffect(() => {
    onRef.current = on;
  }, [on]);
  const [pattern, setPattern] = useState(PATTERNS[0]);
  const [minutes, setMinutes] = useState(2);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [count, setCount] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const breath = useSharedValue(0);
  const autoClose = useAutoClose();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => { clear(); stopSpeaking(); }, []);

  const finish = () => {
    clear();
    breath.set(withTiming(0, { duration: 800 }));
    setRunning(false);
    setFinished(true);
    setPhase(null);
    haptic.success();
    autoClose(say(`Beautifully done. Notice how your body feels now. I’ve added ${minutes} mindful ${minutes === 1 ? 'minute' : 'minutes'} to your journey. Closing the exercise now.`));
    api.post('/activities', { kind: 'breathing', minutes, meta: { pattern: pattern.key } }).catch(() => {});
  };

  const start = (p = pattern, m = minutes) => {
    clear();
    setRunning(true);
    setFinished(false);
    const total = m * 60;
    const endAt = now() + total * 1000;
    setRemaining(total);
    let i = 0;
    const tick = () => {
      if (now() >= endAt) return finish();
      const ph = p.phases[i % p.phases.length];
      // Word, number, haptic and voice all land on the same beat (the cue is already loaded).
      setPhase(ph);
      setCount(ph.seconds);
      haptic.soft();
      if (onRef.current) playCue(ph.label, voiceOptions());
      breath.set(withTiming(ph.to, { duration: ph.seconds * 1000, easing: Easing.inOut(Easing.sin) }));
      for (let sec = 1; sec < ph.seconds; sec++) timers.current.push(setTimeout(() => setCount(ph.seconds - sec), sec * 1000));
      timers.current.push(setTimeout(() => setRemaining(Math.max(0, Math.round((endAt - now()) / 1000))), 0));
      i++;
      timers.current.push(setTimeout(tick, ph.seconds * 1000));
    };
    tick();
  };

  const stop = () => {
    clear();
    stopSpeaking();
    breath.set(withTiming(0, { duration: 600 }));
    setRunning(false);
    setPhase(null);
  };

  // Sol asks, and you can answer out loud: "box for three minutes", "start", "stop", "close".
  useEffect(() => {
    if (!on) return;
    prepareCues(CUES, voiceOptions());
    if (!running && !finished) say('Which breathing would you like? Calm, box, or four seven eight. Say start when you’re ready.');
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  useVoiceCommands((said) => {
    const t = said.toLowerCase();
    if (/\b(close|exit|quit|leave|done|back)\b/.test(t) && !running) return router.back(), true;
    if (/\b(stop|pause|enough|that'?s it)\b/.test(t)) return running ? stop() : router.back(), true;
    // Mid-session, anything else is just the room or the cues; don't let it start a conversation.
    if (running) return true;
    const p = /\bbox\b/.test(t) ? PATTERNS[1] : /\b(4 ?7 ?8|four seven eight|sleep)\b/.test(t) ? PATTERNS[2] : /\bcalm\b/.test(t) ? PATTERNS[0] : null;
    const n = t.match(/\b([1-5]|one|two|three|five)\b(?= ?min)/)?.[1];
    const m = n ? ({ one: 1, two: 2, three: 3, five: 5 } as Record<string, number>)[n] ?? Number(n) : null;
    const minutesSaid = m && DURATIONS.includes(m) ? m : null;
    if (p) setPattern(p);
    if (minutesSaid) setMinutes(minutesSaid);
    if (/\b(start|begin|go|ready|let'?s|again|yes)\b/.test(t) || p || minutesSaid) {
      start(p ?? pattern, minutesSaid ?? minutes);
      return true;
    }
    return false;
  });

  // The words swell gently with each breath.
  const swell = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + breath.value * 0.16 }] }));

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={gradients.deep} style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Tap onPress={() => (running ? stop() : router.back())} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.onDeep} />
        </Tap>
        <View style={styles.topRight}>
          {running && <T style={[styles.timer, { color: colors.onDeepSoft }]}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</T>}
          <SolToggle onDeep />
        </View>
      </View>

      <View style={styles.center}>
        {running && phase ? (
          <Animated.View style={[{ alignItems: 'center' }, swell]}>
            <Animated.View key={phase.label + (count === phase.seconds ? 'start' : '')} entering={FadeIn.duration(300)}>
              <T style={[styles.phase, { color: colors.onDeep }]} numberOfLines={1} adjustsFontSizeToFit>{phase.label}</T>
            </Animated.View>
            <T style={[styles.count, { color: colors.onDeepSoft }]}>{count}</T>
          </Animated.View>
        ) : finished ? (
          <Animated.View entering={FadeInDown} style={{ alignItems: 'center', gap: 12 }}>
            <T style={[styles.phase, { color: colors.onDeep }]} numberOfLines={2} adjustsFontSizeToFit>Beautifully done</T>
            <T style={[styles.sub, { color: colors.onDeepSoft }]}>{minutes} mindful {minutes === 1 ? 'minute' : 'minutes'}</T>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown} style={{ alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
            <T style={[styles.title, { color: colors.onDeep }]}>Breathe</T>
            <T style={[styles.sub, { color: colors.onDeepSoft }]}>{pattern.desc}</T>
          </Animated.View>
        )}
      </View>

      {!running && !finished && (
        <Animated.View entering={FadeInDown.delay(100)} style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.row}>
            {PATTERNS.map((p) => (
              <Chip key={p.key} label={p.name} selected={pattern.key === p.key} onPress={() => setPattern(p)} />
            ))}
          </View>
          <View style={styles.row}>
            {DURATIONS.map((d) => (
              <Chip key={d} label={`${d} min`} selected={minutes === d} onPress={() => setMinutes(d)} />
            ))}
          </View>
          <Button title="Begin" onPress={() => start()} kind="soft" style={{ alignSelf: 'stretch' }} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  timer: { fontFamily: fonts.bold, fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  // Generous line heights so large display type never clips.
  title: { fontFamily: fonts.display, fontSize: 64, lineHeight: 78, textAlign: 'center' },
  phase: { fontFamily: fonts.display, fontSize: 52, lineHeight: 64, textAlign: 'center' },
  count: { fontFamily: fonts.displayLight, fontSize: 120, lineHeight: 140, textAlign: 'center' },
  sub: { fontSize: 17, lineHeight: 24, textAlign: 'center' },
  bottom: { paddingHorizontal: 24, gap: 14, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
});
