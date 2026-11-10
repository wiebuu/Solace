import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SolMark } from '@/components/SolMark';
import { T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { KEYS, prefs } from '@/lib/storage';
import { useHideSol } from '@/lib/solLayer';
import { useTheme } from '@/lib/theme';

/** Launch screen: particles spiral in and settle into the Solace mark, then the wordmark appears. */
export default function Splash() {
  const { ready, user } = useAuth();
  useHideSol();
  const { colors, gradients } = useTheme();
  const [animDone, setAnimDone] = useState(false);
  const rise = useSharedValue(0);

  useEffect(() => {
    rise.value = withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.cubic) });
    const t = setTimeout(() => setAnimDone(true), 2600);
    return () => clearTimeout(t);
  }, [rise]);

  useEffect(() => {
    if (!ready || !animDone) return;
    (async () => {
      if (!user) {
        const seen = await prefs.get(KEYS.onboardingSeen);
        router.replace(seen ? '/sign-in' : '/onboarding');
        return;
      }
      if (!user.onboarded) return router.replace('/setup');
      router.replace('/(tabs)');
      // App launched by tapping a reminder: open the section it points to.
      const url = Notifications.getLastNotificationResponse()?.notification.request.content.data?.url;
      if (typeof url === 'string' && url !== '/') {
        Notifications.clearLastNotificationResponse();
        setTimeout(() => router.push(url as Href), 50);
      }
    })();
  }, [ready, animDone, user]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + 0.08 * rise.value }] }));

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.backdrop} style={StyleSheet.absoluteFill} />
      <Animated.View style={orbStyle}>
        <SolMark size={190} assemble={rise} spin={0.8} />
      </Animated.View>
      <Animated.View entering={FadeIn.delay(1300).duration(900)} style={{ alignItems: 'center', gap: 6, marginTop: 28 }}>
        <T variant="hero" style={styles.title}>Solace</T>
        <T style={[styles.tagline, { color: colors.inkSoft }]}>A warm place to come back to yourself.</T>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  title: { fontSize: 42, lineHeight: 50 },
  tagline: { fontSize: 16, textAlign: 'center' },
});
