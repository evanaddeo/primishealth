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
import { Animated, View } from 'react-native';

import { Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useSleepDetail } from '../../api/hooks/useSleepDetail';
import { DataStatePanel } from '../../components/DataStatePanel';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import { MissingMetricMessage } from '../../components/MissingMetricMessage';
import { dataStateFromScoreState } from '../../components/dataStateModel';
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
  const { spacing } = useTheme();
  const router = useRouter();
  const { getTimingConfig, isReducedMotion } = useReducedMotion();
  const { detail, status, isRefreshing, hasRefreshError, refetch } = useSleepDetail();

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
        <DataStatePanel
          state={status === 'error' ? 'api_error' : 'initial_loading'}
          title={status === 'error' ? 'Couldn’t load your sleep' : 'Loading last night'}
          {...(status === 'error' ? { onAction: () => void refetch() } : {})}
          testID={status === 'error' ? 'sleep-error' : 'sleep-loading'}
        />
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

        {isRefreshing && <DataStatusBanner state="refreshing" testID="sleep-refreshing" />}
        {hasRefreshError && (
          <DataStatusBanner
            state="api_error"
            title="Couldn’t update sleep"
            body="Showing your latest saved sleep data."
            onAction={() => void refetch()}
            testID="sleep-refresh-error"
          />
        )}

        {banner !== null && (
          <SleepBanner banner={banner} onAction={() => void refetch()} testID="sleep-banner" />
        )}

        {detail.score !== null && (
          <SleepScoreHero score={detail.score} confidence={detail.confidence} testID="sleep-hero" />
        )}

        {detail.score !== null && detail.score.missingMetrics.length > 0 && (
          <View style={{ gap: spacing.sm }} testID="sleep-missing-metrics">
            {detail.score.missingMetrics.map((metric) => (
              <MissingMetricMessage key={metric.metricCode} metric={metric} />
            ))}
          </View>
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
          <DataStatePanel
            state={dataStateFromScoreState(detail.state) ?? 'empty'}
            title="Sleep data unavailable"
            body={resolveEmptySleepMessage(detail.state)}
            {...(detail.state === 'provider_unavailable' || detail.state === 'calculation_error'
              ? { onAction: () => void refetch() }
              : {})}
            testID="sleep-empty"
          />
        )}

        <SleepAiSummaryCard sourceDate={detail.localDate} testID="sleep-ai-summary" />

        <BedtimePlannerCard
          onPress={() => router.navigate(BEDTIME_PLANNER_ROUTE)}
          testID="sleep-bedtime-cta"
        />
      </Animated.View>
    </Screen>
  );
}
