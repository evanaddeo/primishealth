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
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home tab' }} />
      <Tabs.Screen
        name="sleep"
        options={{ title: 'Sleep', tabBarAccessibilityLabel: 'Sleep tab' }}
      />
      <Tabs.Screen
        name="recovery"
        options={{ title: 'Recovery', tabBarAccessibilityLabel: 'Recovery tab' }}
      />
      <Tabs.Screen
        name="activity"
        options={{ title: 'Activity', tabBarAccessibilityLabel: 'Activity tab' }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Nutrition', tabBarAccessibilityLabel: 'Nutrition tab' }}
      />
      <Tabs.Screen
        name="coach"
        options={{ title: 'AI Coach', tabBarAccessibilityLabel: 'AI Coach tab' }}
      />
    </Tabs>
  );
}
