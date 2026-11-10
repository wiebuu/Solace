import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MoodFace } from '@/components/MoodFace';
import { SolToggle } from '@/components/SolToggle';
import { Backdrop, Button, Chip, IconButton, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { checkinFlow } from '@/lib/flowDefs';
import { haptic } from '@/lib/haptics';
import { MOOD_TAGS, MOODS, moodByKey, type MoodLevel } from '@/lib/moods';
import { useSession } from '@/lib/session';
import { fonts, makeStyles, tint, useTheme } from '@/lib/theme';
import { useAutoClose } from '@/lib/useAutoClose';

/**
 * Mood check-in: one page. Sol asks the questions out loud and fills the page as you answer;
 * tapping works too. Once it's complete Sol saves it, says so, and the page closes itself.
 */
export default function CheckIn() {
  const insets = useSafeAreaInsets();
  const { colors, dark } = useTheme();
  const s = useStyles();
  const session = useSession();
  const autoClose = useAutoClose();
  const params = useLocalSearchParams<{ mood?: MoodLevel }>();
  const [mood, setMood] = useState<MoodLevel | null>(moodByKey(params.mood)?.key ?? null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const saved = useRef(false);
  const m = moodByKey(mood);

  /** Save once, and return what Sol says about it. */
  const save = async (v: { mood: MoodLevel; tags: string[]; note: string }) => {
    if (saved.current) return '';
    saved.current = true;
    setSaving(true);
    try {
      await api.post('/moods', { mood: v.mood, tags: v.tags, note: v.note.trim() });
      haptic.success();
    } finally {
      setSaving(false);
    }
    const heavy = v.mood === 'low' || v.mood === 'struggling';
    return `Your check-in is saved. ${heavy ? 'Thank you for being honest with me, that takes courage.' : 'I love that you’re noticing the good moments.'} Closing the check-in now.`;
  };

  // With Sol on, Sol asks; every answer fills the page; when it's done, Sol's closing words play
  // and the page closes. With Sol off it's an ordinary form (the Sol button starts the questions).
  const on = session.view !== 'closed';
  useEffect(() => {
    if (!on || saved.current) return;
    const done = session.guide(
      checkinFlow({
        initial: { ...(mood ? { mood } : {}), ...(tags.length ? { tags } : {}), ...(note ? { note } : {}) },
        onAnswer: (key, value) => {
          if (key === 'mood') setMood(value as MoodLevel);
          if (key === 'tags') setTags(value as string[]);
          if (key === 'note') setNote(String(value ?? ''));
        },
        onComplete: (v) => save({ mood: v.mood as MoodLevel, tags: (v.tags as string[]) ?? [], note: String(v.note ?? '') }),
      }),
    );
    autoClose(done);
    return () => session.cancelFlow();
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Finished by hand: stop Sol's questions, save, and let Sol say so. */
  const saveByHand = async () => {
    if (!mood) return;
    session.cancelFlow();
    const words = await save({ mood, tags, note });
    autoClose(session.speakHere(words));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 22, paddingBottom: insets.bottom + 120, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T variant="title">Check-in</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SolToggle />
            <IconButton icon="close" label="Close" variant="soft" size={40} onPress={() => router.back()} />
          </View>
        </View>
        <T variant="heading">{m ? m.prompt : 'How are you, really?'}</T>
        <View style={s.moods}>
          {MOODS.map((x) => (
            <Tap key={x.key} onPress={() => setMood(x.key)} scaleTo={0.85} style={[s.mood, mood === x.key && { backgroundColor: tint(x.color, dark, 0.3) }]} accessibilityLabel={x.label}>
              <MoodFace mood={x.key} size={mood === x.key ? 48 : 40} />
              <T style={[s.moodText, mood === x.key && { color: colors.ink }]}>{x.label}</T>
            </Tap>
          ))}
        </View>
        {m && (
          <Animated.View entering={FadeIn.duration(400)} style={{ gap: 20 }}>
            <View style={{ gap: 10 }}>
              <T variant="label">What’s connected to this?</T>
              <View style={s.tags}>
                {MOOD_TAGS.map((t) => (
                  <Chip key={t} label={t} color={m.color} selected={tags.includes(t)} onPress={() => setTags((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]))} />
                ))}
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <T variant="label">Anything you want to add? (optional)</T>
              <TextInput value={note} onChangeText={setNote} placeholder="A few words is enough…" placeholderTextColor={colors.inkMuted} multiline maxLength={500} style={s.note} />
            </View>
          </Animated.View>
        )}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button title="Save check-in" onPress={saveByHand} disabled={!mood} loading={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  moods: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  mood: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 20 },
  moodText: { fontSize: 12, fontFamily: fonts.medium, color: c.inkSoft },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { minHeight: 96, borderRadius: 20, backgroundColor: c.surface, padding: 16, fontFamily: fonts.body, fontSize: 16, color: c.ink, textAlignVertical: 'top', borderWidth: 1, borderColor: c.line },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 12, backgroundColor: c.overlay },
}));
