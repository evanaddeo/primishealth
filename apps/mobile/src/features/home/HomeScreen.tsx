/**
 * HomeScreen — the local-first daily command center (CU-061).
 *
 * Renders instantly from cached/mock data (no blank spinner), then refreshes in
 * the background. Lays out the eight default widgets in the user's saved order
 * (widgetStore) with a single hero (Recovery), a calm freshness indicator, and a
 * per-card tap target into each detail surface.
 *
 * No scoring, AI calls, or heavy transforms run here — every value arrives
 * precomputed from `useTodayDashboard`. Motion respects the reduced-motion
 * setting (UX-A11Y-004).
 *
 * @see apps/mobile/src/api/hooks/useTodayDashboard.ts — data seam (API/cache/mock)
 * @see apps/mobile/src/features/home/homeModel.ts — ordering / freshness helpers
 * @see UI/UX Spec §6.1 — Home layout, default widgets, freshness/stale states
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useTodayDashboard } from '../../api/hooks/useTodayDashboard';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useWidgetStore } from '../../state/widgetStore';
import { HOME_WIDGET_META, resolveFreshness, resolveVisibleWidgets } from './homeModel';
import { HomeHeader } from './components/HomeHeader';
import { HOME_WIDGET_REGISTRY } from './widgets';

export function HomeScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { getTimingConfig } = useReducedMotion();
  const { snapshot, status, refetch } = useTodayDashboard();

  const widgetOrder = useWidgetStore((s) => s.widgetOrder);
  const hiddenWidgets = useWidgetStore((s) => s.hiddenWidgets);

  // Subtle mount fade — token-driven duration, instant under reduced motion.
  const [fade] = useState(() => new Animated.Value(0));
  const fadeDuration = getTimingConfig('standard').duration;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: fadeDuration,
      useNativeDriver: true,
    }).start();
  }, [fade, fadeDuration]);

  if (snapshot === null) {
    return (
      <Screen testID="screen-home" contentStyle={{ paddingTop: spacing.xl }}>
        {status === 'error' ? (
          <Card testID="home-error">
            <View style={{ gap: spacing.sm }}>
              <Text variant="bodyLarge" weight="semibold">
                Couldn’t load your dashboard
              </Text>
              <Text variant="bodyMedium" color="secondary">
                Pull the latest once you’re back online.
              </Text>
              <Button variant="secondary" label="Try again" onPress={() => void refetch()} />
            </View>
          </Card>
        ) : (
          <View style={[styles.center, { gap: spacing.sm }]} testID="home-loading">
            <ActivityIndicator color={colors.accent} />
            <Text variant="bodyMedium" color="secondary">
              Loading your day…
            </Text>
          </View>
        )}
      </Screen>
    );
  }

  const freshness = resolveFreshness(snapshot.dashboard.providerSyncStatus);
  const visibleWidgets = resolveVisibleWidgets(widgetOrder, hiddenWidgets);

  return (
    <Screen testID="screen-home" contentStyle={{ paddingTop: spacing.xl }}>
      <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
        <HomeHeader localDate={snapshot.dashboard.localDate} freshness={freshness} />

        {visibleWidgets.map((id) => {
          const Widget = HOME_WIDGET_REGISTRY[id];
          const meta = HOME_WIDGET_META[id];
          return (
            <Widget
              key={id}
              snapshot={snapshot}
              onPress={() => router.navigate(meta.route)}
              testID={`home-widget-${id}`}
            />
          );
        })}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
});
