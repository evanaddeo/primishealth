/**
 * BodyCompositionScreen — the trend-first Body Composition surface (CU-067).
 *
 * Renders weight, body fat, and lean mass TREND-FIRST: the recent trajectory
 * leads, with the latest values shown as secondary context and the source +
 * freshness stated plainly. When no body-composition source is connected (the
 * common case until a scale is linked) an explanatory empty state invites the
 * user to connect one. Language is performance-only — this is never presented as
 * a medical chart, and absent metrics are shown as "not available", never
 * fabricated.
 *
 * ⚠ Served from a local mock today (no `/v1/body-composition` contract yet — see
 * bodyCompositionModel.ts). `useBodyComposition` is the single seam a future
 * route swaps into; this screen needs no change when it lands.
 *
 * No scoring, AI calls, or heavy transforms run here — every value arrives
 * precomputed, and trend series come chart-ready. Motion respects the
 * reduced-motion setting (UX-A11Y-004).
 *
 * @see apps/mobile/src/api/hooks/useBodyComposition.ts — data seam (mock today)
 * @see apps/mobile/src/features/bodyComposition/bodyCompositionModel.ts — helpers
 * @see UI/UX Spec §6.8 — Body Composition, trend-first presentation
 */

import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useBodyComposition } from '../../api/hooks/useBodyComposition';
import { DataStatePanel } from '../../components/DataStatePanel';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import { MissingMetricMessage } from '../../components/MissingMetricMessage';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  buildBodyCompMetricRows,
  dataStateFromBodyCompositionState,
  hasBodyCompositionData,
  resolveBodyCompFreshness,
  resolveEmptyBodyCompMessage,
} from './bodyCompositionModel';
import { BodyCompCurrentCard, BodyCompSourceHeader, BodyCompTrendCard } from './components';

export function BodyCompositionScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const router = useRouter();
  const { getTimingConfig, isReducedMotion } = useReducedMotion();
  const { detail, status, isRefreshing, hasRefreshError, refetch } = useBodyComposition();

  const [fade] = useState(() => new Animated.Value(0));
  const fadeDuration = getTimingConfig('standard').duration;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: fadeDuration,
      useNativeDriver: true,
    }).start();
  }, [fade, fadeDuration]);

  const canGoBack = router.canGoBack();

  const header = (
    <View style={{ gap: spacing.xs }}>
      {canGoBack && (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={styles.backRow}
        >
          <Text variant="bodyMedium" color="accent" weight="semibold">
            ‹ Back
          </Text>
        </Pressable>
      )}
      <Text variant="titleLarge">Body Composition</Text>
      <Text variant="bodySmall" color="muted">
        Trends over recent weigh-ins
      </Text>
    </View>
  );

  // `useBodyComposition` seeds initialData, so `detail` is always present here;
  // the guard keeps the screen resilient if a future live route returns null.
  if (detail === null) {
    return (
      <Screen
        testID="screen-body-composition"
        contentStyle={{ paddingTop: spacing.xl, gap: spacing.lg }}
      >
        {header}
        <DataStatePanel
          state={status === 'error' ? 'api_error' : 'initial_loading'}
          {...(status === 'error' ? { onAction: () => void refetch() } : {})}
          testID={status === 'error' ? 'body-comp-error' : 'body-comp-loading'}
        />
      </Screen>
    );
  }

  const showData = hasBodyCompositionData(detail);
  const freshness = resolveBodyCompFreshness(detail.generatedAt);
  const metricRows = buildBodyCompMetricRows(detail.metrics);

  return (
    <Screen testID="screen-body-composition" contentStyle={{ paddingTop: spacing.xl }}>
      <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
        {header}

        {isRefreshing && <DataStatusBanner state="refreshing" testID="body-comp-refreshing" />}
        {hasRefreshError && (
          <DataStatusBanner
            state="api_error"
            title="Couldn’t update body composition"
            body="Showing your latest saved measurements."
            onAction={() => void refetch()}
            testID="body-comp-refresh-error"
          />
        )}
        {detail.state === 'provider_unverified' && (
          <DataStatusBanner
            state="provider_unverified"
            body="These mock-backed fields reflect documented schemas; live source availability is not confirmed."
            testID="body-comp-unverified"
          />
        )}
        {detail.state === 'stale_data' && <DataStatusBanner state="stale_data" />}

        <BodyCompSourceHeader
          source={detail.source}
          freshness={freshness}
          testID="body-comp-source"
        />

        {showData ? (
          <>
            <BodyCompTrendCard
              trends={detail.trends}
              reducedMotion={isReducedMotion}
              testID="body-comp-trends"
            />
            <BodyCompCurrentCard rows={metricRows} testID="body-comp-latest" />
            {metricRows
              .filter((row) => !row.isAvailable)
              .map((row) => (
                <MissingMetricMessage
                  key={row.key}
                  metric={{
                    metricCode: row.key,
                    reason: 'provider_did_not_supply',
                    isRequired: false,
                  }}
                />
              ))}
          </>
        ) : (
          <DataStatePanel
            state={dataStateFromBodyCompositionState(detail.state)}
            title="Body composition unavailable"
            body={resolveEmptyBodyCompMessage(detail)}
            {...(detail.state === 'provider_disconnected'
              ? { onAction: () => router.navigate('/settings/connections') }
              : detail.state === 'provider_unavailable' || detail.state === 'api_error'
                ? { onAction: () => void refetch() }
                : {})}
            testID="body-comp-empty"
          />
        )}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    alignSelf: 'flex-start',
  },
});
