import { useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Header } from '@/components/Header';
import { TAB_BAR_SPACE } from '@/components/TabBar';
import { Button, Card, Input, Screen, T, Tap } from '@/components/ui';
import type { Reminder, ReminderKind } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { reminderFlow } from '@/lib/flowDefs';
import { useSession } from '@/lib/session';
import { haptic } from '@/lib/haptics';
import { formatTime, requestNotificationPermission, sendPreview } from '@/lib/notifications';
import { fonts, makeStyles, radius, useTheme } from '@/lib/theme';

const ICONS: Record<ReminderKind, keyof typeof Ionicons.glyphMap> = {
  checkin: 'happy-outline',
  affirmation: 'sunny-outline',
  breathing: 'leaf-outline',
  selfcare: 'moon-outline',
  custom: 'heart-outline',
};

function TimeStepper({ hour, minute, onChange }: { hour: number; minute: number; onChange: (h: number, m: number) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const shift = (mins: number) => {
    haptic.tap();
    const total = (hour * 60 + minute + mins + 1440) % 1440;
    onChange(Math.floor(total / 60), total % 60);
  };
  return (
    <View style={styles.stepper}>
      <Tap onPress={() => shift(-15)} hitSlop={8} style={styles.stepBtn} accessibilityLabel="Earlier">
        <Ionicons name="remove" size={18} color={colors.ink} />
      </Tap>
      <T style={styles.time}>{formatTime(hour, minute)}</T>
      <Tap onPress={() => shift(15)} hitSlop={8} style={styles.stepBtn} accessibilityLabel="Later">
        <Ionicons name="add" size={18} color={colors.ink} />
      </Tap>
    </View>
  );
}

export default function Reminders() {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const { user, update } = useAuth();
  const [items, setItems] = useState<Reminder[]>(user?.reminders ?? []);
  const [granted, setGranted] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [preview, setPreview] = useState('');
  const session = useSession();
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Sol asks (staying small and on), and the new reminder appears here as you answer.
  // Asking Sol is the person's own choice here, so this button does switch Sol on.
  const addWithSol = () => (
    session.ensureOn(),
    session.guide(
      reminderFlow({
        onAnswer: (key, value) => key === 'title' && setNewTitle(String(value)),
        onComplete: async (v) => {
          const t = v.time as { hour: number; minute: number };
          const next = [...itemsRef.current, { id: `custom-${Date.now()}`, kind: 'custom' as const, title: String(v.title), body: 'A gentle nudge from Sol', hour: t.hour, minute: t.minute, enabled: true }];
          setItems(next);
          setNewTitle('');
          await requestNotificationPermission();
          await update({ reminders: next });
          return `Done. I’ll remind you every day at ${formatTime(t.hour, t.minute)}.`;
        },
      }),
    )
  );

  useEffect(() => {
    Notifications.getPermissionsAsync().then((p) => setGranted(p.granted)).catch(() => {});
  }, []);

  const edit = (id: string, patch: Partial<Reminder>) => {
    setItems((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const add = () => {
    if (!newTitle.trim()) return;
    haptic.success();
    setItems((all) => [
      ...all,
      { id: `custom-${Date.now()}`, kind: 'custom', title: newTitle.trim(), body: 'A gentle nudge from Sol 💛', hour: 12, minute: 0, enabled: true },
    ]);
    setNewTitle('');
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const ok = await requestNotificationPermission();
      setGranted(ok);
      await update({ reminders: items }); // also reschedules on-device notifications
      setDirty(false);
      haptic.success();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen bottomInset={TAB_BAR_SPACE}>
      <Header title="Reminders" back={false} />

      {!granted && (
        <Card tint={gradients.warm} style={styles.banner}>
          <Ionicons name="notifications-off-outline" size={20} color={colors.ink} />
          <T style={{ flex: 1, color: colors.ink }}>Notifications are off. Allow them so Sol can reach you.</T>
          <Tap onPress={async () => setGranted(await requestNotificationPermission())}>
            <T style={{ fontFamily: fonts.bold, color: colors.primary }}>Allow</T>
          </Tap>
        </Card>
      )}

      <View style={{ gap: 12, marginTop: 8 }}>
        {items.map((r, i) => (
          <Animated.View key={r.id} entering={FadeInDown.delay(i * 50)} layout={LinearTransition}>
            <Card style={[styles.card, !r.enabled && { opacity: 0.6 }]}>
              <View style={styles.row}>
                <View style={styles.icon}>
                  <Ionicons name={ICONS[r.kind]} size={18} color={colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong">{r.title}</T>
                  <T variant="caption" numberOfLines={1}>{r.body}</T>
                </View>
                <Switch value={r.enabled} onValueChange={(v) => { haptic.tap(); edit(r.id, { enabled: v }); }} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white} />
              </View>
              <View style={styles.row}>
                <TimeStepper hour={r.hour} minute={r.minute} onChange={(hour, minute) => edit(r.id, { hour, minute })} />
                <View style={{ flex: 1 }} />
                <Tap
                  onPress={async () => {
                    if (await sendPreview(r)) {
                      setPreview(r.id);
                      setTimeout(() => setPreview(''), 6000);
                    }
                  }}
                  hitSlop={8}>
                  <T style={styles.link}>{preview === r.id ? 'Arriving in 5s…' : 'Preview'}</T>
                </Tap>
                {r.kind === 'custom' && (
                  <Tap onPress={() => { setItems((all) => all.filter((x) => x.id !== r.id)); setDirty(true); }} hitSlop={8} accessibilityLabel="Remove reminder">
                    <Ionicons name="trash-outline" size={18} color={colors.inkMuted} />
                  </Tap>
                )}
              </View>
            </Card>
          </Animated.View>
        ))}
      </View>

      <Card style={{ gap: 12, marginTop: 18 }}>
        <T variant="heading">Add your own</T>
        <Button title="Tell Sol what to remind you" onPress={addWithSol} />
        <Input placeholder="e.g. Drink some water, Call mom" value={newTitle} onChangeText={setNewTitle} onSubmitEditing={add} returnKeyType="done" maxLength={60} />
        <Button kind="outline" title="Add reminder" onPress={add} disabled={!newTitle.trim()} />
      </Card>

      {dirty && (
        <Animated.View entering={FadeInDown} style={styles.saveBar}>
          <Button title="Save reminders" onPress={save} loading={saving} />
        </Animated.View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  card: { gap: 14, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSoft, borderRadius: radius.pill, padding: 4 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  time: { fontFamily: fonts.bold, color: colors.ink, minWidth: 74, textAlign: 'center' },
  link: { fontFamily: fonts.bold, color: colors.primary, fontSize: 14 },
  saveBar: { marginTop: 20 },
}));
