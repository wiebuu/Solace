import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T, Tap } from './ui';
import { useTheme } from '@/lib/theme';

export function Header({ title, subtitle, back = true }: { title: string; subtitle?: string; back?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 14, marginBottom: 8 }}>
      {back && (
        <Tap onPress={() => router.back()} hitSlop={12} style={{ width: 38, height: 38, justifyContent: 'center' }} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Tap>
      )}
      <T variant="title">{title}</T>
      {subtitle ? <T>{subtitle}</T> : null}
    </View>
  );
}
