import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_SPACE } from '@/components/TabBar';
import { Backdrop, Card, ListGroup, ListRow, Section, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { useTabReselect } from '@/lib/tabEvents';
import { fonts, makeStyles, THEME_ORDER, THEMES, useTheme } from '@/lib/theme';
import { CHARACTERS, characterFor, speak, TONES, type Character, type VoiceGender } from '@/lib/voice';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors } = theme;
  const s = useStyles();
  const { user, update, signOut, refresh } = useAuth();
  useTabReselect('profile', () => void refresh().catch(() => {}));
  const session = useSession();
  const current = characterFor(user?.voiceName, user?.voiceGender);
  const [gender, setGender] = useState<VoiceGender>(current.gender);
  if (!user) return null;

  const since = new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const pick = (c: Character) => {
    update({ voiceGender: c.gender, voiceName: c.key, companionTone: c.tone });
    session.setVoicePreview({ gender: c.gender, tone: c.tone, voice: c.key });
    speak(`Hi, I'm ${c.label}. ${TONES.find((x) => x.key === c.tone)!.sample}`, { gender: c.gender, tone: c.tone, voice: c.key });
  };

  const toggleMemory = (on: boolean) => {
    if (on) {
      update({ memoryEnabled: true });
      return;
    }
    Alert.alert('Turn off memory?', 'Sol will forget everything it has learned about you and stop remembering new things.', [
      { text: 'Keep memory', style: 'cancel' },
      { text: 'Turn off', style: 'destructive', onPress: () => update({ memoryEnabled: false }) },
    ]);
  };

  const logout = async () => {
    session.close();
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    await signOut();
    router.replace('/sign-in');
  };

  const deleteAccount = () =>
    Alert.alert('Delete your account?', 'This permanently removes your check-ins, conversations and everything Sol knows. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: async () => {
          await api.del('/me');
          haptic.success();
          await logout();
        },
      },
    ]);

  const sw = (v: boolean, onChange: (v: boolean) => void) => (
    <Switch value={v} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white} />
  );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_BAR_SPACE + 24, gap: 26 }} showsVerticalScrollIndicator={false}>
        <View style={s.head}>
          <View style={s.avatar}><T style={s.avatarText}>{user.name.slice(0, 1).toUpperCase()}</T></View>
          <View style={{ flex: 1 }}>
            <T variant="title" style={{ fontSize: 24 }}>{user.name}</T>
            <T variant="caption">With Sol since {since}</T>
          </View>
        </View>

        <Section title="Sol’s voice">
          <Card style={{ gap: 12 }}>
            {/* Girl or guy first, then one of four characters, each with its own voice and manner. */}
            <View style={s.segment}>
              {(['female', 'male'] as const).map((g) => (
                <Tap key={g} onPress={() => setGender(g)} style={[s.segmentItem, gender === g && { backgroundColor: colors.surface }]} scaleTo={0.98} accessibilityState={{ selected: gender === g }}>
                  <T variant="bodyStrong" style={{ color: gender === g ? colors.ink : colors.inkMuted }}>{g === 'female' ? 'Girl' : 'Guy'}</T>
                </Tap>
              ))}
            </View>
            <View style={s.voices}>
              {CHARACTERS.filter((c) => c.gender === gender).map((c, i) => {
                const on = current.key === c.key;
                return (
                  <Tap key={c.key} onPress={() => pick(c)} style={[s.voiceCard, on && { backgroundColor: colors.primary, borderColor: colors.primary }]} accessibilityState={{ selected: on }} accessibilityLabel={`${c.label}: ${c.trait}`}>
                    <View style={[s.voiceAvatar, { backgroundColor: on ? colors.surface : theme.orb.particles[i % 4] }]}>
                      <T style={[s.voiceInitial, { color: on ? colors.primary : colors.white }]}>{c.label[0]}</T>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T variant="bodyStrong" style={on && { color: colors.onPrimary }}>{c.label}</T>
                      <T variant="caption" numberOfLines={2} style={on && { color: colors.onPrimary }}>{c.trait}</T>
                    </View>
                  </Tap>
                );
              })}
            </View>
          </Card>
        </Section>

        <Section title="Theme">
          <Card style={s.themes}>
            {THEME_ORDER.map((n) => {
              const th = THEMES[n];
              const on = theme.name === n;
              return (
                <Tap key={n} onPress={() => theme.setTheme(n)} style={s.swatch} accessibilityLabel={`${th.label} theme`} accessibilityState={{ selected: on }}>
                  <View style={[s.swatchColor, { backgroundColor: th.colors.bg, borderColor: th.colors.line }]}>
                    <View style={[s.swatchDot, { backgroundColor: th.colors.primary }]}>
                      {on && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                    </View>
                  </View>
                  <T style={[s.swatchText, on && { color: colors.ink, fontFamily: fonts.bold }]}>{th.label}</T>
                </Tap>
              );
            })}
          </Card>
        </Section>

        <Section title="Preferences">
          <ListGroup>
            <ListRow icon="mic-outline" label="Start by voice" right={sw(user.preferVoice !== false, (v) => void update({ preferVoice: v }))} />
            <ListRow icon="bookmark-outline" label="Memory" right={sw(user.memoryEnabled, toggleMemory)} />
            <ListRow icon="notifications-outline" label="Reminders" detail={`${user.reminders.filter((r) => r.enabled).length} on`} onPress={() => router.push('/reminders')} />
            <ListRow icon="library-outline" label="What Sol remembers" onPress={() => router.push('/memories')} />
          </ListGroup>
        </Section>

        <Section title="Account">
          <ListGroup>
            <ListRow icon="log-out-outline" label="Sign out" onPress={logout} />
            <ListRow icon="trash-outline" label="Delete account" onPress={deleteAccount} danger />
          </ListGroup>
        </Section>

      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  segment: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: c.surfaceSoft },
  segmentItem: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  voices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  voiceCard: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, backgroundColor: c.surfaceSoft, borderWidth: 1, borderColor: c.line },
  voiceAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  voiceInitial: { fontFamily: fonts.display, fontSize: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display, fontSize: 26, color: c.ink, lineHeight: 32 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themes: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 },
  swatch: { alignItems: 'center', gap: 8 },
  swatchColor: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  swatchDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  swatchText: { fontSize: 12, fontFamily: fonts.medium, color: c.inkMuted },
}));
