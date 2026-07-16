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
import { Animated, View } from 'react-native';

import { Button, Screen, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useTodayDashboard } from '../../api/hooks/useTodayDashboard';
import { DataStatePanel } from '../../components/DataStatePanel';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import { StaleDataBanner } from '../../components/StaleDataBanner';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useWidgetStore } from '../../state/widgetStore';
import { QuickAddLauncher } from '../quickAdd';
import { HOME_WIDGET_META, resolveFreshness, resolveVisibleWidgets } from './homeModel';
import { HomeHeader } from './components/HomeHeader';
import { HOME_WIDGET_REGISTRY } from './widgets';

export function HomeScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const router = useRouter();
  const { getTimingConfig } = useReducedMotion();
  const { snapshot, status, isRefreshing, hasRefreshError, refetch } = useTodayDashboard();

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
        <DataStatePanel
          state={status === 'error' ? 'api_error' : 'initial_loading'}
          title={status === 'error' ? 'Couldn’t load your dashboard' : 'Loading your day'}
          body={
            status === 'error'
              ? 'Check your connection and try again.'
              : 'Primis is preparing today’s dashboard.'
          }
          {...(status === 'error' ? { onAction: () => void refetch() } : {})}
          testID={status === 'error' ? 'home-error' : 'home-loading'}
        />
      </Screen>
    );
  }

  const freshness = resolveFreshness(snapshot.dashboard.providerSyncStatus);
  const visibleWidgets = resolveVisibleWidgets(widgetOrder, hiddenWidgets);

  return (
    <Screen testID="screen-home" contentStyle={{ paddingTop: spacing.xl }}>
      <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
        <HomeHeader
          localDate={snapshot.dashboard.localDate}
          freshness={freshness}
          onPressSettings={() => router.navigate('/settings')}
          onPressEdit={() => router.navigate('/settings/home-widgets')}
        />

        {isRefreshing && <DataStatusBanner state="refreshing" testID="home-refreshing" />}
        {hasRefreshError && (
          <DataStatusBanner
            state="api_error"
            title="Couldn’t update Home"
            body="Showing your latest saved dashboard."
            onAction={() => void refetch()}
            testID="home-refresh-error"
          />
        )}
        {snapshot.dashboard.providerSyncStatus.length === 0 ? (
          <DataStatusBanner
            state="provider_disconnected"
            onAction={() => router.navigate('/settings/connections')}
            testID="home-provider-disconnected"
          />
        ) : freshness.isStale ? (
          <StaleDataBanner onAction={() => void refetch()} testID="home-stale" />
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm }} testID="home-quick-actions">
          <View style={{ flex: 1 }}>
            <QuickAddLauncher label="Quick add" testID="home-quick-add" />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              label="Check in"
              onPress={() => router.navigate('/check-in')}
              accessibilityHint="Opens the daily check-in"
              testID="home-check-in"
            />
          </View>
        </View>

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
