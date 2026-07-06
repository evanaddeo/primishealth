/**
 * ActivityScreen — the Activity / movement & training-load surface (CU-066).
 *
 * Renders the Phase F `ActivityDetailResponseDto` into a single-hero layout:
 * Activity Score, daily movement summary (steps/distance/active time/zone
 * minutes), energy, the day's workouts (with a calm no-workout state), the
 * training-load trend with acute-vs-chronic context, a local score breakdown,
 * and an AI summary placeholder. Provisional/stale days surface a calm,
 * non-blocking banner; missing/learning days show an explanatory empty state.
 * Language is performance-only — never medical or diagnostic (UX-ACT-001..003).
 *
 * No scoring, AI calls, or heavy transforms run here — every value arrives
 * precomputed from `useActivityDetail`, and the training-load series comes
 * chart-ready into the design-system BarChart. Workout recording is intentionally
 * out of scope for v1. Motion respects the reduced-motion setting (UX-A11Y-004).
 *
 * @see apps/mobile/src/api/hooks/useActivityDetail.ts — data seam (API/cache/mock)
 * @see apps/mobile/src/features/activity/activityModel.ts — pure formatting helpers
 * @see UI/UX Spec §6.5 — Activity screen, workout list, training-load context
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, useTheme } from '@primis/design-system';

import { useActivityDetail } from '../../api/hooks/useActivityDetail';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  hasActivityScore,
  resolveActivityBanner,
  resolveEmptyActivityMessage,
} from './activityModel';
import {
  ActivityAiSummaryCard,
  ActivityBanner,
  ActivityCaloriesCard,
  ActivityContributorsCard,
  ActivityLoadCard,
  ActivityMovementCard,
  ActivityScoreHero,
  ActivityWorkoutsCard,
} from './components';

export function ActivityScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const { getTimingConfig, isReducedMotion } = useReducedMotion();
  const { detail, status, refetch } = useActivityDetail();

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
      <Screen testID="screen-activity" contentStyle={{ paddingTop: spacing.xl }}>
        {status === 'error' ? (
          <Card testID="activity-error">
            <View style={{ gap: spacing.sm }}>
              <Text variant="bodyLarge" weight="semibold">
                Couldn’t load your activity
              </Text>
              <Text variant="bodyMedium" color="secondary">
                Pull the latest once you’re back online.
              </Text>
              <Button variant="secondary" label="Try again" onPress={() => void refetch()} />
            </View>
          </Card>
        ) : (
          <View style={[styles.center, { gap: spacing.sm }]} testID="activity-loading">
            <ActivityIndicator color={colors.accent} />
            <Text variant="bodyMedium" color="secondary">
              Loading today’s activity…
            </Text>
          </View>
        )}
      </Screen>
    );
  }

  const banner = resolveActivityBanner(detail);
  const showScore = hasActivityScore(detail);
  const hasSummary = detail.summary !== null;
  // The full layout shows whenever there is a score OR movement data to render.
  const showDetail = showScore || hasSummary;

  return (
    <Screen testID="screen-activity" contentStyle={{ paddingTop: spacing.xl }}>
      <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
        <View style={{ gap: spacing.xxs }}>
          <Text variant="titleLarge">Activity</Text>
          <Text variant="bodySmall" color="muted">
            Today
          </Text>
        </View>

        {banner !== null && <ActivityBanner banner={banner} testID="activity-banner" />}

        {detail.score !== null && showScore && (
          <ActivityScoreHero
            score={detail.score}
            confidence={detail.confidence}
            testID="activity-hero"
          />
        )}

        {showDetail ? (
          <>
            <ActivityMovementCard summary={detail.summary} testID="activity-movement" />
            <ActivityCaloriesCard summary={detail.summary} testID="activity-calories" />
            <ActivityLoadCard
              summary={detail.summary}
              trends={detail.trends}
              reducedMotion={isReducedMotion}
              testID="activity-load"
            />
            <ActivityWorkoutsCard workouts={detail.workouts} testID="activity-workouts" />
            {detail.score !== null && showScore && (
              <ActivityContributorsCard score={detail.score} testID="activity-contributors" />
            )}
          </>
        ) : (
          <Card testID="activity-empty">
            <Text variant="bodyMedium" color="secondary">
              {resolveEmptyActivityMessage(detail.state)}
            </Text>
          </Card>
        )}

        <ActivityAiSummaryCard sourceDate={detail.localDate} testID="activity-ai-summary" />
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
