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
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useVitalsDetail } from '../../api/hooks/useVitalsDetail';
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
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { getTimingConfig, isReducedMotion } = useReducedMotion();
  const { detail, status, refetch } = useVitalsDetail();

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
        {status === 'error' ? (
          <Card testID="vitals-error">
            <View style={{ gap: spacing.sm }}>
              <Text variant="bodyLarge" weight="semibold">
                Couldn’t load your vitals
              </Text>
              <Text variant="bodyMedium" color="secondary">
                Pull the latest once you’re back online.
              </Text>
              <Button variant="secondary" label="Try again" onPress={() => void refetch()} />
            </View>
          </Card>
        ) : (
          <View style={[styles.center, { gap: spacing.sm }]} testID="vitals-loading">
            <ActivityIndicator color={colors.accent} />
            <Text variant="bodyMedium" color="secondary">
              Loading today’s vitals…
            </Text>
          </View>
        )}
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

        {banner !== null && <VitalsBanner banner={banner} testID="vitals-banner" />}

        {showDetail ? (
          <>
            <VitalsSourceHeader
              source={CONNECTED_SOURCE_LABEL}
              freshness={freshness}
              note={UNVERIFIED_NOTE}
              testID="vitals-source"
            />
            <VitalsMetricGrid rows={metricRows} testID="vitals-metrics" />
            <VitalsTrendCard
              trends={detail.trends}
              reducedMotion={isReducedMotion}
              testID="vitals-trends"
            />
          </>
        ) : (
          <Card testID="vitals-empty">
            <Text variant="bodyMedium" color="secondary">
              {resolveEmptyVitalsMessage(detail.state)}
            </Text>
          </Card>
        )}

        <BodyCompositionLinkCard onPress={goToBodyComposition} testID="vitals-body-comp-link" />
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
  backRow: {
    alignSelf: 'flex-start',
  },
});
