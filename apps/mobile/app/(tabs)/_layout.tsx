import { Tabs } from 'expo-router';

// Tab order is locked per UX-NAV-001/002 — do not rearrange:
// Home → Sleep → Recovery → Activity → Nutrition → AI Coach

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          // TODO(CU-017): replace with theme token (dark.background.primary)
          backgroundColor: '#07090D',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="sleep" options={{ title: 'Sleep' }} />
      <Tabs.Screen name="recovery" options={{ title: 'Recovery' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="coach" options={{ title: 'AI Coach' }} />
    </Tabs>
  );
}
