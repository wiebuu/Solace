import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { MemoryToast } from '@/components/MemoryToast';
import { SolLayer } from '@/components/SolLayer';
import { SolOverlay } from '@/components/SolOverlay';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SessionProvider } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

/** Taps on reminders while the app is open or backgrounded. Cold-start taps are handled by the splash route. */
function useNotificationTaps() {
  const { user } = useAuth();
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && user?.onboarded) {
        router.push(url as Href);
        Notifications.clearLastNotificationResponse();
      }
    });
    return () => sub.remove();
  }, [user]);
}

function RootStack() {
  useNotificationTaps();
  const { colors, dark } = useTheme();
  // Activity screens are regular (non-modal) routes so Sol's mini player can float above them.
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="setup" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="checkin" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="breathe" />
        <Stack.Screen name="grounding" />
        <Stack.Screen name="affirmation" />
        <Stack.Screen name="memories" options={{ animation: 'slide_from_right' }} />
      </Stack>
      <SolOverlay />
      <SolLayer />
      <MemoryToast />
    </View>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_600SemiBold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <SessionProvider>
            <RootStack />
          </SessionProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
