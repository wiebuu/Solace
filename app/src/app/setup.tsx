import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, Switch, View } from 'react-native';
import { AiFormBar, Backdrop, Button, Card, Chip, T, Tap } from '@/components/ui';
import { api, type Reminder } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { GENDER_OPTIONS, GOAL_OPTIONS, setupFlow, THEME_OPTIONS, TONE_OPTIONS, WELLBEING } from '@/lib/flowDefs';
import { SCALE_LABELS, type FlowValues } from '@/lib/flows';
import { haptic } from '@/lib/haptics';
import { DEFAULT_REMINDERS, requestNotificationPermission, syncReminders } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { fonts, makeStyles, THEMES, useTheme, type ThemeName } from '@/lib/theme';
import { speak, type Tone, type VoiceGender } from '@/lib/voice';

interface Form {
  goals: string[];
  voiceGender: VoiceGender;
  tone: Tone;
  answers: (number | null)[];
  reminders: boolean;
  memory: boolean;
}

/** Profile setup. Sol asks everything by voice; the form underneath fills in live and stays editable. */
export default function Setup() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors } = theme;
  const s = useStyles();
  const { user, update } = useAuth();
  const session = useSession();
  const [form, setForm] = useState<Form>({ goals: [], voiceGender: 'female', tone: 'warm', answers: WELLBEING.map(() => null), reminders: true, memory: true });
  const [saving, setSaving] = useState(false);
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  const name = user?.name.split(' ')[0] ?? 'friend';

  const finish = async (f: Form = formRef.current) => {
    setSaving(true);
    try {
      if (f.answers.every((a) => a !== null)) await api.post('/assessments', { answers: f.answers });
      const reminders: Reminder[] = DEFAULT_REMINDERS.map((r) => ({ ...r, enabled: f.reminders && r.enabled }));
      const granted = f.reminders ? await requestNotificationPermission() : false;
      await update({ goals: f.goals, voiceGender: f.voiceGender, companionTone: f.tone, memoryEnabled: f.memory, reminders, onboarded: true });
      if (granted) await syncReminders(reminders);
      haptic.success();
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  const startWithSol = () =>
    session.runFlow(
      setupFlow(name, {
        onAnswer: (key, value) => {
          if (key === 'goals') setForm((f) => ({ ...f, goals: value as string[] }));
          if (key === 'voiceGender') {
            session.setVoicePreview({ gender: value as VoiceGender });
            setForm((f) => ({ ...f, voiceGender: value as VoiceGender }));
          }
          if (key === 'tone') {
            session.setVoicePreview({ tone: value as Tone });
            setForm((f) => ({ ...f, tone: value as Tone }));
          }
          if (key === 'theme') theme.setTheme(value as ThemeName);
          if (key.startsWith('wb')) setForm((f) => ({ ...f, answers: f.answers.map((a, i) => (`wb${i}` === key ? (value as number) : a)) }));
          if (key === 'reminders') setForm((f) => ({ ...f, reminders: value as boolean }));
          if (key === 'memory') setForm((f) => ({ ...f, memory: value as boolean }));
        },
        onComplete: async (v: FlowValues) => {
          // Read the latest form (answers may also have been edited by hand).
          setTimeout(() => finish(), 2400);
          return v.memory ? `Thank you, ${name}. I’ll remember the little things. Welcome to your space.` : `Thank you, ${name}. Welcome to your space.`;
        },
      }),
      { mode: 'voice' },
    );

  // AI-first: Sol starts the conversation as soon as the screen opens.
  useEffect(() => {
    const t = setTimeout(startWithSol, 400);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = (gender: VoiceGender, tone: Tone) => speak(`Hi ${name}, this is how I sound.`, { gender, tone });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 120, gap: 16 }} showsVerticalScrollIndicator={false}>
        <T variant="title">Let’s set up your space</T>
        <AiFormBar onTalk={() => (session.view === 'mini' ? session.expand() : startWithSol())} active={session.view !== 'closed' && session.kind === 'flow'} />

        <Card style={s.section}>
          <T variant="label">What brings you here?</T>
          <View style={s.wrap}>
            {GOAL_OPTIONS.map((g) => (
              <Chip key={g.value} label={g.label} selected={form.goals.includes(g.value)} onPress={() => set('goals', form.goals.includes(g.value) ? form.goals.filter((x) => x !== g.value) : [...form.goals, g.value])} />
            ))}
          </View>
        </Card>

        <Card style={s.section}>
          <T variant="label">Sol’s voice</T>
          <View style={s.wrap}>
            {GENDER_OPTIONS.map((g) => (
              <Chip key={g.value} label={g.label} selected={form.voiceGender === g.value} onPress={() => { set('voiceGender', g.value as VoiceGender); preview(g.value as VoiceGender, form.tone); }} />
            ))}
          </View>
          <T variant="label" style={{ marginTop: 6 }}>Tone</T>
          <View style={s.wrap}>
            {TONE_OPTIONS.map((t) => (
              <Chip key={t.value} label={t.label} selected={form.tone === t.value} onPress={() => { set('tone', t.value as Tone); preview(form.voiceGender, t.value as Tone); }} />
            ))}
          </View>
        </Card>

        <Card style={s.section}>
          <T variant="label">Your look</T>
          <View style={s.wrap}>
            {THEME_OPTIONS.map((o) => {
              const th = THEMES[o.value as ThemeName];
              return (
                <Tap key={o.value} onPress={() => theme.setTheme(o.value as ThemeName)} style={s.swatch}>
                  <View style={[s.swatchColor, { backgroundColor: th.colors.bg }]}>
                    <View style={[s.swatchDot, { backgroundColor: th.colors.primary }]}>
                      {theme.name === o.value && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                    </View>
                  </View>
                  <T style={s.swatchText}>{o.label}</T>
                </Tap>
              );
            })}
          </View>
        </Card>

        <Card style={s.section}>
          <T variant="label">The last two weeks</T>
          {WELLBEING.map((w, i) => (
            <View key={w} style={{ gap: 8 }}>
              <T variant="bodyStrong">How often have you felt {w}?</T>
              <View style={s.wrap}>
                {SCALE_LABELS.map((label, v) => (
                  <Tap key={label} onPress={() => set('answers', form.answers.map((a, j) => (j === i ? v : a)))} style={[s.scale, form.answers[i] === v && { backgroundColor: colors.primary }]}>
                    <T style={[s.scaleText, form.answers[i] === v && { color: colors.onPrimary }]}>{label}</T>
                  </Tap>
                ))}
              </View>
            </View>
          ))}
        </Card>

        <Card style={s.section}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">Gentle reminders</T>
            </View>
            <Switch value={form.reminders} onValueChange={(v) => set('reminders', v)} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white} />
          </View>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">Let Sol remember</T>
            </View>
            <Switch value={form.memory} onValueChange={(v) => set('memory', v)} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white} />
          </View>
        </Card>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button title="Enter Solace" onPress={() => { session.close(); finish(); }} loading={saving} disabled={!form.goals.length} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  section: { gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scale: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: c.surfaceSoft },
  scaleText: { fontSize: 13, fontFamily: fonts.medium, color: c.inkSoft },
  swatch: { alignItems: 'center', gap: 8 },
  swatchColor: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line },
  swatchDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  swatchText: { fontSize: 12, fontFamily: fonts.bold, color: c.ink },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: c.overlay },
}));
