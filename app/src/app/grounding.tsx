import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SolToggle } from '@/components/SolToggle';
import { Backdrop, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { fonts, makeStyles, useTheme } from '@/lib/theme';
import { useReturnToSol, useSession } from '@/lib/session';
import { useAutoClose } from '@/lib/useAutoClose';
import { countMentioned, useVoiceCommands } from '@/lib/useVoiceCommands';

const STEPS = [
  { n: 5, sense: 'see', icon: 'eye-outline', hint: 'Look around slowly. A colour, a shape, the light on a wall.', color: '#97B4D6' },
  { n: 4, sense: 'feel', icon: 'hand-left-outline', hint: 'Your feet on the floor, fabric on your skin, the air on your face.', color: '#9CBF92' },
  { n: 3, sense: 'hear', icon: 'ear-outline', hint: 'Near and far. Traffic, birds, your own breath.', color: '#B49AD6' },
  { n: 2, sense: 'smell', icon: 'flower-outline', hint: 'Coffee, soap, fresh air. Or imagine a favourite scent.', color: '#EFA27C' },
  { n: 1, sense: 'taste', icon: 'cafe-outline', hint: 'Take a sip of water, or simply notice your mouth right now.', color: '#E2918F' },
] as const;

/** 5-4-3-2-1 grounding: big, calm type. Sol (heard, not shown) asks; say or tap what you notice. */
export default function Grounding() {
  useReturnToSol();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const st = useStyles();
  // One voice for the whole app: the page speaks through Sol, which keeps listening afterwards.
  const { speakHere: say, view } = useSession();
  const on = view !== 'closed';
  const [step, setStep] = useState(0);
  const [found, setFound] = useState(0);
  const done = step >= STEPS.length;
  const s = STEPS[Math.min(step, STEPS.length - 1)];

  const prompt = () =>
    say(
      done
        ? 'You’re here. Right now. Come back to this any time it gets loud. That’s the grounding done, closing the exercise now.'
        : `Notice ${s.n} ${s.n === 1 ? 'thing' : 'things'} you can ${s.sense}. ${step === 0 ? 'Just tell me each one as you find it.' : s.hint}`,
    );
  const autoClose = useAutoClose();
  useEffect(() => {
    const words = prompt();
    // Finished: once Sol has said its last line, the exercise closes itself.
    if (done) autoClose(words);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sol switched on mid-exercise: it picks up from the current step.
  useEffect(() => {
    if (on && !done) prompt();
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextStep = () => {
    haptic.success();
    setFound(0);
    setStep(step + 1);
    if (step + 1 === STEPS.length) api.post('/activities', { kind: 'reflection', minutes: 3, meta: { type: 'grounding' } }).catch(() => {});
  };
  /** Count `n` things noticed (a tap is one; saying "a lamp and a chair" is two). */
  const notice = (n = 1) => {
    if (found + n < s.n) {
      haptic.soft();
      setFound(found + n);
      return;
    }
    nextStep();
  };

  // Say what you notice instead of tapping: "I see one", "the window and a plant", "next".
  useVoiceCommands((said) => {
    const t = said.toLowerCase();
    if (/\b(stop|close|exit|quit|leave|end)\b/.test(t)) return router.back(), true;
    if (done) {
      if (/\b(done|thanks|thank you|ok(ay)?|good|great)\b/.test(t)) router.back();
      return true;
    }
    if (/\b(next|skip|move on)\b/.test(t)) return nextStep(), true;
    if (/\b(repeat|again|what was|say that)\b/.test(t)) return prompt(), true;
    notice(countMentioned(t));
    return true;
  });

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}>
      <Backdrop />
      <View style={st.top}>
        <Tap onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.inkSoft} />
        </Tap>
        <View style={st.progress}>
          {STEPS.map((x, i) => (
            <View key={x.n} style={[st.seg, i < step && { backgroundColor: colors.sage }, i === step && { backgroundColor: x.color }]} />
          ))}
        </View>
        <SolToggle />
      </View>
      {done ? (
        <Animated.View entering={FadeInDown.duration(500)} style={st.center}>
          <T style={st.doneTitle} numberOfLines={2} adjustsFontSizeToFit>You’re here.{'\n'}Right now.</T>
          <T style={st.hint}>Grounding pulls you out of the spiral and back into your body.</T>
        </Animated.View>
      ) : (
        <Animated.View key={step} entering={FadeInRight.duration(400)} style={st.center}>
          <T style={[st.number, { color: s.color }]}>{s.n}</T>
          <T style={st.sense} numberOfLines={2} adjustsFontSizeToFit>
            {s.n === 1 ? 'thing' : 'things'} you can {s.sense}
          </T>
          <T style={st.hint}>{s.hint}</T>
          <View style={st.dots}>
            {Array.from({ length: s.n }, (_, i) => (
              <View key={i} style={[st.dot, i < found && { backgroundColor: s.color, borderColor: s.color }]} />
            ))}
          </View>
        </Animated.View>
      )}
      {!done && (
        <Tap onPress={() => notice()} feedback="none" scaleTo={0.97} style={[st.pill, { backgroundColor: s.color }]} accessibilityLabel="I noticed one">
          <Ionicons name={s.icon} size={22} color={colors.white} />
          <T style={st.pillText}>I noticed one</T>
        </Tap>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.line },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 8 },
  // Generous line heights so large display type never clips.
  number: { fontFamily: fonts.displayLight, fontSize: 132, lineHeight: 150, textAlign: 'center' },
  sense: { fontFamily: fonts.display, fontSize: 38, lineHeight: 48, color: c.ink, textAlign: 'center' },
  hint: { fontSize: 16, lineHeight: 24, color: c.inkSoft, textAlign: 'center', maxWidth: 300 },
  doneTitle: { fontFamily: fonts.display, fontSize: 48, lineHeight: 60, color: c.ink, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 12, marginTop: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.line },
  pill: { height: 60, borderRadius: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  pillText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 17 },
}));
