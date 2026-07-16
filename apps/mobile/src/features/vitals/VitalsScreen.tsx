/**
 * VitalsScreen — the Vitals detail surface (CU-067).
 *
 * Renders the Phase F `VitalsDetailResponseDto` into a source-first layout:
 * a source + freshness header, the day's vital signals vs baseline (HRV, resting
 * HR, respiratory rate, SpO₂, VO₂ max), recent trends, and a link to the
 * trend-first Body Composition surface. Stale days surface a calm, non-blocking
 * banner; days with no vitals show an explanatory empty/learning state. Metrics
 * the source did not supply are listed honestly as "not available" rather than as
 * fabricated zeros, and language is performance-only — never medical or
 * diagnostic (§2.6 / availability decision doc).
 *
 * No scoring, AI calls, or heavy transforms run here — every value arrives
 * precomputed from `useVitalsDetail`, and trend series come chart-ready. Motion
 * respects the reduced-motion setting (UX-A11Y-004).
 *
 * @see apps/mobile/src/api/hooks/useVitalsDetail.ts — data seam (API/cache/mock)
 * @see apps/mobile/src/features/vitals/vitalsModel.ts — pure formatting helpers
 * @see UI/UX Spec §6.8 — Vitals detail, source/staleness rules
 */

import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useVitalsDetail } from '../../api/hooks/useVitalsDetail';
import { DataStatePanel } from '../../components/DataStatePanel';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import { dataStateFromScoreState } from '../../components/dataStateModel';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { BODY_COMPOSITION_ROUTE } from '../bodyComposition/routes';
import {
  CONNECTED_SOURCE_LABEL,
  UNVERIFIED_NOTE,
  buildVitalMetricRows,
  hasVitals,
  resolveEmptyVitalsMessage,
  resolveVitalsBanner,
  resolveVitalsFreshness,
} from './vitalsModel';
import {
  BodyCompositionLinkCard,
  VitalsBanner,
  VitalsMetricGrid,
  VitalsSourceHeader,
  VitalsTrendCard,
} from './components';

export function VitalsScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const router = useRouter();
  const { getTimingConfig, isReducedMotion } = useReducedMotion();
  const { detail, status, isRefreshing, hasRefreshError, refetch } = useVitalsDetail();

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

  const canGoBack = router.canGoBack();
  const goToBodyComposition = (): void => router.navigate(BODY_COMPOSITION_ROUTE);

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
      <Text variant="titleLarge">Vitals</Text>
      <Text variant="bodySmall" color="muted">
        Today
      </Text>
    </View>
  );

  if (detail === null) {
    return (
      <Screen testID="screen-vitals" contentStyle={{ paddingTop: spacing.xl, gap: spacing.lg }}>
        {header}
        <DataStatePanel
          state={status === 'error' ? 'api_error' : 'initial_loading'}
          title={status === 'error' ? 'Couldn’t load your vitals' : 'Loading today’s vitals'}
          {...(status === 'error' ? { onAction: () => void refetch() } : {})}
          testID={status === 'error' ? 'vitals-error' : 'vitals-loading'}
        />
      </Screen>
    );
  }

  const banner = resolveVitalsBanner(detail);
  const showDetail = hasVitals(detail);
  const freshness = resolveVitalsFreshness(detail.generatedAt);
  const metricRows = buildVitalMetricRows(detail.metrics, detail.baselineDeviations);

  return (
    <Screen testID="screen-vitals" contentStyle={{ paddingTop: spacing.xl }}>
      <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
        {header}

        {isRefreshing && <DataStatusBanner state="refreshing" testID="vitals-refreshing" />}
        {hasRefreshError && (
          <DataStatusBanner
            state="api_error"
            title="Couldn’t update vitals"
            body="Showing your latest saved vitals data."
            onAction={() => void refetch()}
            testID="vitals-refresh-error"
          />
        )}

        {banner !== null && (
          <VitalsBanner banner={banner} onAction={() => void refetch()} testID="vitals-banner" />
        )}

        {showDetail ? (
          <>
            <VitalsSourceHeader
              source={CONNECTED_SOURCE_LABEL}
              freshness={freshness}
              testID="vitals-source"
            />
            <DataStatusBanner
              state="provider_unverified"
              body={UNVERIFIED_NOTE}
              testID="vitals-provider-unverified"
            />
            <VitalsMetricGrid rows={metricRows} testID="vitals-metrics" />
            <VitalsTrendCard
              trends={detail.trends}
              reducedMotion={isReducedMotion}
              testID="vitals-trends"
            />
          </>
        ) : (
          <DataStatePanel
            state={dataStateFromScoreState(detail.state) ?? 'empty'}
            title="Vitals unavailable"
            body={resolveEmptyVitalsMessage(detail.state)}
            {...(detail.state === 'provider_unavailable' || detail.state === 'calculation_error'
              ? { onAction: () => void refetch() }
              : {})}
            testID="vitals-empty"
          />
        )}

        <BodyCompositionLinkCard onPress={goToBodyComposition} testID="vitals-body-comp-link" />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    alignSelf: 'flex-start',
  },
});
