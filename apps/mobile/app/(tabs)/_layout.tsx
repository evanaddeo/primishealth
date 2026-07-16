import { useEffect, useRef } from 'react';

import { Tabs } from 'expo-router';

import {
  PERFORMANCE_EVENT_CODES,
  performanceMarks,
  type PerformanceSpan,
} from '../../src/performance/performanceMarks';

// Tab order is locked per UX-NAV-001/002 — do not rearrange:
// Home → Sleep → Recovery → Activity → Nutrition → AI Coach

export default function TabLayout() {
  const transitionSpanRef = useRef<PerformanceSpan | null>(null);
  const commitFrameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (commitFrameRef.current !== null) cancelAnimationFrame(commitFrameRef.current);
      transitionSpanRef.current?.finish('cancelled');
    },
    [],
  );

  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          if (commitFrameRef.current !== null) {
            cancelAnimationFrame(commitFrameRef.current);
            commitFrameRef.current = null;
          }
          transitionSpanRef.current?.finish('cancelled');
          transitionSpanRef.current = performanceMarks.start(
            PERFORMANCE_EVENT_CODES.NAVIGATION_TAB_TRANSITION,
          );
        },
        focus: () => {
          if (transitionSpanRef.current === null) return;
          commitFrameRef.current = requestAnimationFrame(() => {
            transitionSpanRef.current?.finish('completed', 1);
            transitionSpanRef.current = null;
            commitFrameRef.current = null;
          });
        },
      }}
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
