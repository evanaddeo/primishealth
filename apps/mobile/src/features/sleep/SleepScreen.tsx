/**
 * SleepScreen — the premium Sleep detail surface (CU-063).
 *
 * Renders the Phase F `SleepDetailResponseDto` into a single-hero layout: Sleep
 * Score, stage timeline (with classic-tracker / processing / missing fallbacks),
 * headline metrics, sleep debt + consistency trend, a local score breakdown, an
 * AI summary placeholder, and the Bedtime Planner entry point (UX-SLEEP-004).
 *
 * No scoring, AI calls, or heavy transforms run here — every value arrives
 * precomputed from `useSleepDetail`, and stage segments come chart-ready. Motion
 * respects the reduced-motion setting (UX-A11Y-004).
 *
 * @see apps/mobile/src/api/hooks/useSleepDetail.ts — data seam (API/cache/mock)
 * @see apps/mobile/src/features/sleep/sleepModel.ts — pure formatting helpers
 * @see UI/UX Spec §6.2 — Sleep screen, stage timeline, loading/missing states
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useSleepDetail } from '../../api/hooks/useSleepDetail';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { hasSleepSummary, resolveEmptySleepMessage, resolveSleepBanner } from './sleepModel';
import {
  BedtimePlannerCard,
  SleepAiSummaryCard,
  SleepBanner,
  SleepContributorsCard,
  SleepMetricsGrid,
  SleepScoreHero,
  SleepStageCard,
  SleepTrendCard,
} from './components';

const BEDTIME_PLANNER_ROUTE = '/sleep/bedtime-planner';

export function SleepScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { getTimingConfig, isReducedMotion } = useReducedMotion();
  const { detail, status, refetch } = useSleepDetail();

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

  if (detail === null) {
    return (
      <Screen testID="screen-sleep" contentStyle={{ paddingTop: spacing.xl }}>
        {status === 'error' ? (
          <Card testID="sleep-error">
            <View style={{ gap: spacing.sm }}>
              <Text variant="bodyLarge" weight="semibold">
                Couldn’t load your sleep
              </Text>
              <Text variant="bodyMedium" color="secondary">
                Pull the latest once you’re back online.
              </Text>
              <Button variant="secondary" label="Try again" onPress={() => void refetch()} />
            </View>
          </Card>
        ) : (
          <View style={[styles.center, { gap: spacing.sm }]} testID="sleep-loading">
            <ActivityIndicator color={colors.accent} />
            <Text variant="bodyMedium" color="secondary">
              Loading last night…
            </Text>
          </View>
        )}
      </Screen>
    );
  }

  const banner = resolveSleepBanner(detail);
  const showDetail = hasSleepSummary(detail);

  return (
    <Screen testID="screen-sleep" contentStyle={{ paddingTop: spacing.xl }}>
      <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
        <View style={{ gap: spacing.xxs }}>
          <Text variant="titleLarge">Sleep</Text>
          <Text variant="bodySmall" color="muted">
            Last night
          </Text>
        </View>

        {banner !== null && <SleepBanner banner={banner} testID="sleep-banner" />}

        {detail.score !== null && (
          <SleepScoreHero score={detail.score} confidence={detail.confidence} testID="sleep-hero" />
        )}

        {showDetail && detail.summary !== null ? (
          <>
            <SleepStageCard detail={detail} reducedMotion={isReducedMotion} testID="sleep-stages" />
            <SleepMetricsGrid summary={detail.summary} testID="sleep-metrics" />
            <SleepTrendCard detail={detail} reducedMotion={isReducedMotion} testID="sleep-trend" />
            {detail.score !== null && (
              <SleepContributorsCard score={detail.score} testID="sleep-contributors" />
            )}
          </>
        ) : (
          <Card testID="sleep-empty">
            <Text variant="bodyMedium" color="secondary">
              {resolveEmptySleepMessage(detail.state)}
            </Text>
          </Card>
        )}

        <SleepAiSummaryCard testID="sleep-ai-summary" />

        <BedtimePlannerCard
          onPress={() => router.navigate(BEDTIME_PLANNER_ROUTE)}
          testID="sleep-bedtime-cta"
        />
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
