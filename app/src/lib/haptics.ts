import * as Haptics from 'expo-haptics';

// Thin wrapper so every interaction uses the same, gentle haptic vocabulary.
export const haptic = {
  tap: () => Haptics.selectionAsync().catch(() => {}),
  soft: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};
