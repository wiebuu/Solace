import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Reminder, ReminderKind } from './api';

const CHANNEL = 'gentle-reminders';

// Where tapping each kind of reminder takes the user.
export const REMINDER_ROUTES: Record<ReminderKind, string> = {
  checkin: '/checkin',
  affirmation: '/affirmation',
  breathing: '/breathe',
  selfcare: '/grounding',
  custom: '/',
};

export const DEFAULT_REMINDERS: Reminder[] = [
  { id: 'affirmation', kind: 'affirmation', title: 'Your affirmation for today', body: 'Sol picked one just for you ☀️', hour: 8, minute: 30, enabled: true },
  { id: 'checkin', kind: 'checkin', title: 'How are you arriving today?', body: 'A 10-second check-in helps Sol understand you better.', hour: 13, minute: 0, enabled: true },
  { id: 'breathing', kind: 'breathing', title: 'Time for a breath', body: 'Two quiet minutes. Your shoulders will thank you.', hour: 16, minute: 0, enabled: true },
  { id: 'selfcare', kind: 'selfcare', title: 'Wind down with Sol', body: 'Let the day settle with a short grounding exercise.', hour: 21, minute: 30, enabled: false },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Gentle reminders',
    // eslint-disable-next-line import/namespace -- re-exported enum the lint rule can't resolve
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 120, 80, 120],
    lightColor: '#9F8FE0',
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureChannel(); // Android 13+ only prompts once a channel exists.
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return next.granted;
}

/**
 * Replaces every scheduled reminder with the user's current preferences. These are
 * OS-level daily triggers, so they fire whether the app is backgrounded or closed.
 */
export async function syncReminders(reminders: Reminder[], extras: { affirmation?: string } = {}) {
  if (Platform.OS === 'web') return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const r of reminders.filter((x) => x.enabled)) {
    const body = r.kind === 'affirmation' && extras.affirmation ? `“${extras.affirmation}”` : r.body;
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body, data: { url: REMINDER_ROUTES[r.kind] } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute, channelId: CHANNEL },
    });
  }
}

/** Fires a reminder a few seconds from now so users can preview how it feels. */
export async function sendPreview(r: Reminder) {
  if (!(await requestNotificationPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: r.title, body: r.body, data: { url: REMINDER_ROUTES[r.kind] } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL },
  });
  return true;
}

export function formatTime(hour: number, minute: number) {
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}
