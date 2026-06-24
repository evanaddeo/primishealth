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

import { Card, Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useBodyComposition } from '../../api/hooks/useBodyComposition';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  buildBodyCompMetricRows,
  hasBodyCompositionData,
  resolveBodyCompFreshness,
  resolveEmptyBodyCompMessage,
} from './bodyCompositionModel';
import { BodyCompCurrentCard, BodyCompSourceHeader, BodyCompTrendCard } from './components';

export function BodyCompositionScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const router = useRouter();
  const { getTimingConfig, isReducedMotion } = useReducedMotion();
  const { detail } = useBodyComposition();

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
          </>
        ) : (
          <Card testID="body-comp-empty">
            <Text variant="bodyMedium" color="secondary">
              {resolveEmptyBodyCompMessage(detail)}
            </Text>
          </Card>
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
