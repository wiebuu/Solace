import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/TabBar';
import { useLocationSync } from '@/lib/location';

export default function TabsLayout() {
  // Signed in and on the main tabs: ask once where they are, so Sol knows their city.
  useLocationSync();
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="reminders" />
      <Tabs.Screen name="journey" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
