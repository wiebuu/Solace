import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Header } from '@/components/Header';
import { SolOrb } from '@/components/SolOrb';
import { Card, Screen, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { makeStyles, useTheme } from '@/lib/theme';

import { useOnRemembered, type Memory } from '@/lib/memories';

/** Transparency + control over what Sol has learned. */
export default function Memories() {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const [items, setItems] = useState<Memory[] | null>(null);

  useEffect(() => {
    api.get<{ memories: Memory[] }>('/memories').then((r) => setItems(r.memories)).catch(() => setItems([]));
  }, []);

  // New things Sol learns appear here at once, even while this page is open.
  const addNew = useCallback((added: Memory[]) => setItems((all) => [...added, ...(all ?? []).filter((x) => !added.some((a) => a._id === x._id))]), []);
  useOnRemembered(addNew);

  const forget = async (m: Memory) => {
    haptic.medium();
    setItems((all) => all?.filter((x) => x._id !== m._id) ?? null);
    await api.del(`/memories/${m._id}`).catch(() => {});
  };

  return (
    <Screen>
      <Header
        title="What Sol remembers"
        subtitle="Small notes Sol keeps so it doesn’t ask the same things twice. Only you and Sol can see them. Tap the × to make Sol forget."
      />
      {!user?.memoryEnabled && (
        <Card tint={gradients.warm} style={{ marginBottom: 12 }}>
          <T style={{ color: colors.ink }}>Memory is off, so Sol isn’t remembering anything new. You can turn it on from the You tab.</T>
        </Card>
      )}
      {items && items.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 12, marginTop: 24 }}>
          <SolOrb size={130} state="listening" />
          <T style={{ textAlign: 'center' }}>Nothing yet. As you talk, Sol will gently remember the people and things that matter to you.</T>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {items?.map((m, i) => (
            <Animated.View key={m._id} entering={FadeInDown.delay(i * 40)} exiting={FadeOut} layout={LinearTransition}>
              <Card style={styles.row}>
                <Ionicons name="bookmark" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong">{m.text}</T>
                  <T variant="caption">{new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</T>
                </View>
                <Tap onPress={() => forget(m)} hitSlop={10} accessibilityLabel="Forget this">
                  <Ionicons name="close-circle" size={22} color={colors.inkMuted} />
                </Tap>
              </Card>
            </Animated.View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
}));
