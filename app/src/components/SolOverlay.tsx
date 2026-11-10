import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Chip, T, Tap } from './ui';
import { useSession, type Turn } from '@/lib/session';
import { solDrag, solSpots } from '@/lib/solLayer';
import { spokenPieces, useSpokenLine, useSpokenWord } from '@/lib/voice';
import { fonts, makeStyles, radius, useTheme } from '@/lib/theme';


function SafetyCard() {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={s.safety}>
      <T variant="heading">You don’t have to carry this alone</T>
      <T variant="caption" style={{ color: colors.inkSoft }}>If you might be in danger, please reach out to someone now.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="Call Tele MANAS 14416" onPress={() => Linking.openURL('tel:14416')} />
        <Chip label="Call 988 (US)" onPress={() => Linking.openURL('tel:988')} />
        <Chip label="Find a helpline" onPress={() => Linking.openURL('https://findahelpline.com')} />
      </View>
    </View>
  );
}

/** Small pill for quick replies and Sol's suggestions on the deep page. */
/**
 * Sol's words on the big screen, in step with its voice: while it talks, the sentence being spoken
 * (so a long reply is never cut off), with the current word lit; afterwards, the whole reply,
 * scrollable if it's long.
 */
function LiveCaption({ text }: { text: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  const { orb } = useSession();
  const line = useSpokenLine();
  const current = useSpokenWord(line);
  // One look throughout: the piece being spoken, word by word. Before the audio starts it's the
  // first piece, unlit; once Sol has finished it's the last piece, fully lit.
  const pieces = spokenPieces(text);
  const shown = line?.text ?? (orb === 'speaking' ? pieces[0] : pieces[pieces.length - 1]);
  const lit = (i: number) => (line ? i < current : orb !== 'speaking');
  return (
    <T style={s.caption}>
      {shown.split(/\s+/).map((w, i) => (
        <T key={i} style={{ color: line && i === current ? colors.primary : lit(i) ? colors.ink : colors.inkMuted }}>{w} </T>
      ))}
    </T>
  );
}

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  const s = useStyles();
  return (
    <Tap onPress={onPress} style={s.pill} scaleTo={0.96} accessibilityRole="button">
      <T style={s.pillText} numberOfLines={1}>{label}</T>
    </Tap>
  );
}

function Bubble({ turn, last, light }: { turn: Turn; last: boolean; light?: boolean }) {
  const s = useStyles();
  const session = useSession();
  const mine = turn.role === 'user';
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 8 }}>
      <View style={[s.bubble, mine ? (light ? s.meLight : s.bubbleMe) : light ? s.solLight : s.bubbleSol]}>
        <T style={mine ? (light ? s.textMeLight : s.textMe) : light ? s.textSolLight : s.textSol}>{turn.text}</T>
      </View>
      {!mine && last && turn.suggestions?.length ? (
        <View style={s.chipRow}>
          {turn.suggestions.map((x) => (
            <Pill key={x.label} label={x.label} onPress={() => session.openSuggestion(x.kind)} />
          ))}
        </View>
      ) : null}
      {!mine && turn.safety && last ? <SafetyCard /> : null}
    </Animated.View>
  );
}

/** Text field with a clear button, plus separate mic (on/off) and send buttons. */
function Composer({ light }: { light?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  const session = useSession();
  const [text, setText] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const has = text.trim().length > 0;
  const listening = session.orb === 'listening';
  const fg = light ? colors.ink : colors.ink;
  const soft = light ? colors.inkMuted : colors.inkSoft;
  const submit = () => {
    if (!has) return;
    session.send(text);
    setText('');
  };
  // Without on-device speech recognition (Expo Go), the mic opens the keyboard's dictation instead.
  const mic = () => (session.canListen ? session.tapMic() : input.current?.focus());
  return (
    <View style={s.composer}>
      <View style={[s.inputWrap, light && s.inputWrapLight]}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={(v) => {
            setText(v);
            session.nudge();
          }}
          placeholder={session.kind === 'flow' ? 'Your answer' : 'Message Sol'}
          placeholderTextColor={soft}
          style={[s.input, { color: fg }]}
          multiline
          onSubmitEditing={submit}
          blurOnSubmit
          returnKeyType="send"
        />
        {text.length > 0 && (
          <Tap onPress={() => setText('')} hitSlop={10} style={s.clear} accessibilityLabel="Clear">
            <Ionicons name="close-circle" size={20} color={soft} />
          </Tap>
        )}
      </View>
      <Tap
        onPress={mic}
        style={[s.round, light ? s.roundLight : s.roundDeep, listening && { backgroundColor: colors.primary, borderColor: colors.primary }]}
        scaleTo={0.9}
        accessibilityLabel={listening ? 'Mic off' : 'Mic on'}>
        <Ionicons name={listening ? 'mic' : 'mic-outline'} size={21} color={listening ? colors.onPrimary : fg} />
      </Tap>
      <Tap onPress={submit} disabled={!has} style={[s.round, { backgroundColor: colors.ink }, !has && { opacity: 0.35 }]} scaleTo={0.9} accessibilityLabel="Send">
        <Ionicons name="arrow-up" size={21} color={light ? colors.onButton : colors.onButton} />
      </Tap>
    </View>
  );
}

function FullPage() {
  const s = useStyles();
  const { colors, gradients } = useTheme();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const list = useRef<ComponentRef<typeof ScrollView>>(null);

  const chat = session.showTranscript;
  const lastSol = [...session.turns].reverse().find((t) => t.role === 'sol');
  const suggestions = session.kind === 'talk' && !chat ? (lastSol?.suggestions ?? []) : [];
  // Sol itself is drawn by the app-wide SolLayer; this page leaves room and a tap target.
  const spots = solSpots(width, height, insets);
  const spot = chat ? spots.chat : spots.voice;

  useEffect(() => {
    if (!chat) return;
    // Once now, and again after bubbles finish laying out (fonts, entering animations).
    const a = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60);
    const b = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 400);
    return () => (clearTimeout(a), clearTimeout(b));
  }, [session.turns.length, session.partial, chat]);

  // Dragging down pulls Sol toward the tab bar; let go past the threshold to minimise.
  const pan = Gesture.Pan()
    .enabled(!chat && session.kind === 'talk')
    .activeOffsetY(12)
    .onUpdate((e) => {
      solDrag.set(Math.min(1, Math.max(0, e.translationY / 360)));
    })
    .onEnd((e) => {
      if (solDrag.value > 0.28 || e.velocityY > 800) runOnJS(session.minimize)();
      else solDrag.set(withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) }));
    });

  const page = useAnimatedStyle(() => ({ opacity: 1 - solDrag.value * 0.9 }));

  return (
    <Animated.View entering={FadeIn.duration(260)} exiting={FadeOut.duration(220)} style={[StyleSheet.absoluteFill, { zIndex: 50 }, page]}>
      <LinearGradient colors={gradients.backdrop} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.top, { paddingTop: insets.top + 8 }]}>
          <Tap onPress={session.kind === 'flow' ? session.close : session.minimize} hitSlop={12} style={s.topBtn} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Tap>
          <View style={{ alignItems: 'center' }}>
            <T style={s.title}>{session.flowTitle || 'Sol'}</T>
            {session.progress && <T style={s.progress}>{session.progress.index} / {session.progress.total}</T>}
          </View>
          <Tap onPress={session.close} hitSlop={12} style={s.topBtn} accessibilityLabel="End chat">
            <Ionicons name="close" size={24} color={colors.ink} />
          </Tap>
        </View>

        {chat ? (
          <Animated.View key="chat" entering={FadeIn.duration(350).delay(150)} style={{ flex: 1 }}>
            <View style={{ height: spots.chat.size + 6 }} />
            <ScrollView
              ref={list}
              // Follow the conversation all the way down: on every new message or typing preview.
              onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
              onLayout={() => list.current?.scrollToEnd({ animated: false })}
              contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 10 }}
              keyboardShouldPersistTaps="handled"
            >
              {session.turns.map((item, index) => (
                <Bubble key={item.id} turn={item} last={index === session.turns.length - 1} />
              ))}
              {session.partial ? <T style={s.partialBubble}>{session.partial}</T> : null}
            </ScrollView>
          </Animated.View>
        ) : (
          <GestureDetector gesture={pan}>
            <Animated.View key="voice" entering={FadeIn.duration(350).delay(150)} style={{ flex: 1 }}>
              <View style={{ height: spots.gap + spots.voice.size - 8 }} />
              <View style={s.captionWrap}>
                {lastSol && (
                  <Tap key={lastSol.id} onPress={session.showChat} scaleTo={0.99} feedback="none" accessibilityLabel="Open chat">
                    <LiveCaption text={lastSol.text} />
                  </Tap>
                )}
                {lastSol?.safety ? <SafetyCard /> : null}
                {session.partial ? <T style={s.partial}>“{session.partial}”</T> : null}
              </View>
            </Animated.View>
          </GestureDetector>
        )}

        {(session.quick.length > 0 || suggestions.length > 0) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.quick} keyboardShouldPersistTaps="handled">
            {session.quick.map((q) => (
              <Pill key={q} label={q} onPress={() => session.send(q)} />
            ))}
            {suggestions.map((x) => (
              <Pill key={x.label} label={x.label} onPress={() => session.openSuggestion(x.kind)} />
            ))}
          </ScrollView>
        )}
        <View style={{ paddingBottom: insets.bottom + 12, paddingHorizontal: 16 }}>
          {chat ? (
            <Composer />
          ) : (
            <View style={s.controls}>
              <View style={{ width: 52 }} />
              <Tap onPress={session.tapMic} style={[s.mic, session.orb === 'listening' && { backgroundColor: colors.primary }]} scaleTo={0.9} feedback="none" accessibilityLabel="Mic">
                <Ionicons name={session.orb === 'listening' ? 'mic' : session.orb === 'speaking' ? 'hand-left-outline' : 'mic-outline'} size={30} color={session.orb === 'listening' ? colors.onPrimary : colors.onButton} />
              </Tap>
              <Tap onPress={session.showChat} style={s.side} accessibilityLabel="Keyboard">
                <MaterialCommunityIcons name="keyboard-outline" size={24} color={colors.ink} />
              </Tap>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Tap target over Sol: talk in the voice view, back to voice from the chat. */}
      <GestureDetector gesture={pan}>
        <View style={{ position: 'absolute', left: spot.x - spot.size / 2, top: spot.y - spot.size / 2, width: spot.size, height: spot.size }}>
          <Tap onPress={chat ? () => session.setMode('voice') : session.tapMic} feedback="none" scaleTo={1} style={{ flex: 1, borderRadius: spot.size / 2 }} accessibilityLabel={chat ? 'Voice mode' : 'Talk'} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

/** Rendered once at the root, above every screen. */
export function SolOverlay() {
  const { view } = useSession();
  // Minimised, Sol lives in the tab bar's centre orb (see TabBar).
  return view === 'full' ? <FullPage /> : null;
}

const useStyles = makeStyles((c) => ({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 6 },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 19, color: c.ink },
  progress: { fontFamily: fonts.bold, fontSize: 12, color: c.inkSoft },
  captionWrap: { flex: 1, paddingHorizontal: 28, justifyContent: 'center', gap: 14 },
  caption: { fontFamily: fonts.display, fontSize: 23, lineHeight: 32, color: c.ink, textAlign: 'center' },
  partial: { fontFamily: fonts.displayItalic, fontSize: 18, lineHeight: 26, color: c.inkSoft, textAlign: 'center' },
  quick: { paddingHorizontal: 16, gap: 8, paddingVertical: 8, alignItems: 'center' },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
  pillText: { fontFamily: fonts.medium, fontSize: 13.5, color: c.ink },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4 },
  mic: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' },
  side: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, paddingRight: 10 },
  inputWrapLight: { backgroundColor: c.surfaceSoft, borderColor: c.line },
  input: { flex: 1, minHeight: 46, maxHeight: 110, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.body, fontSize: 16 },
  clear: { padding: 2 },
  round: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  roundDeep: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
  roundLight: { backgroundColor: c.surfaceSoft, borderWidth: 1, borderColor: c.line },
  bubble: { maxWidth: '84%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22 },
  bubbleSol: { alignSelf: 'flex-start', backgroundColor: c.surface, borderBottomLeftRadius: 6 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: c.ink, borderBottomRightRadius: 6 },
  solLight: { alignSelf: 'flex-start', backgroundColor: c.surfaceSoft, borderBottomLeftRadius: 6, paddingVertical: 10 },
  meLight: { alignSelf: 'flex-end', backgroundColor: c.ink, borderBottomRightRadius: 6, paddingVertical: 10 },
  textSol: { color: c.ink, fontSize: 16, lineHeight: 24 },
  textMe: { color: c.onButton, fontSize: 16, lineHeight: 24 },
  textSolLight: { color: c.ink, fontSize: 15, lineHeight: 22 },
  textMeLight: { color: c.onButton, fontSize: 15, lineHeight: 22 },
  partialBubble: { alignSelf: 'flex-end', color: c.inkSoft, fontStyle: 'italic', paddingHorizontal: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
  safety: { backgroundColor: c.roseSoft, borderRadius: radius.lg, padding: 16, gap: 10 },
}));
