/**
 * RecoveryScreen — the Recovery / readiness surface (CU-065).
 *
 * Renders the Phase F `RecoveryDetailResponseDto` into a single-hero layout:
 * Recovery Score, training-readiness guidance + recommended intensity, vitals
 * vs baseline (HRV/RHR/respiratory/SpO₂), a local score breakdown, recent
 * HRV/RHR trends, and an AI summary placeholder. Provisional/stale days surface
 * a calm, non-blocking banner; missing/learning days show an explanatory empty
 * state. Language is performance-only — never medical or diagnostic
 * (UX-REC-001..003).
 *
 * No scoring, AI calls, or heavy transforms run here — every value arrives
 * precomputed from `useRecoveryDetail`, and trend series come chart-ready.
 * Motion respects the reduced-motion setting (UX-A11Y-004).
 *
 * @see apps/mobile/src/api/hooks/useRecoveryDetail.ts — data seam (API/cache/mock)
 * @see apps/mobile/src/features/recovery/recoveryModel.ts — pure formatting helpers
 * @see UI/UX Spec §6.4 — Recovery screen, contributors, recommended intensity
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, useTheme } from '@primis/design-system';

import { useRecoveryDetail } from '../../api/hooks/useRecoveryDetail';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  hasRecoveryScore,
  resolveEmptyRecoveryMessage,
  resolveRecoveryBanner,
} from './recoveryModel';
import {
  RecoveryAiSummaryCard,
  RecoveryBanner,
  RecoveryContributorsCard,
  RecoveryGuidanceCard,
  RecoveryScoreHero,
  RecoveryTrendCard,
  RecoveryVitalsCard,
} from './components';

export function RecoveryScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const { getTimingConfig, isReducedMotion } = useReducedMotion();
  const { detail, status, refetch } = useRecoveryDetail();

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
      <Screen testID="screen-recovery" contentStyle={{ paddingTop: spacing.xl }}>
        {status === 'error' ? (
          <Card testID="recovery-error">
            <View style={{ gap: spacing.sm }}>
              <Text variant="bodyLarge" weight="semibold">
                Couldn’t load your recovery
              </Text>
              <Text variant="bodyMedium" color="secondary">
                Pull the latest once you’re back online.
              </Text>
              <Button variant="secondary" label="Try again" onPress={() => void refetch()} />
            </View>
          </Card>
        ) : (
          <View style={[styles.center, { gap: spacing.sm }]} testID="recovery-loading">
            <ActivityIndicator color={colors.accent} />
            <Text variant="bodyMedium" color="secondary">
              Loading today’s recovery…
            </Text>
          </View>
        )}
      </Screen>
    );
  }

  const banner = resolveRecoveryBanner(detail);
  const showDetail = hasRecoveryScore(detail);

  return (
    <Screen testID="screen-recovery" contentStyle={{ paddingTop: spacing.xl }}>
      <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
        <View style={{ gap: spacing.xxs }}>
          <Text variant="titleLarge">Recovery</Text>
          <Text variant="bodySmall" color="muted">
            Today
          </Text>
        </View>

        {banner !== null && <RecoveryBanner banner={banner} testID="recovery-banner" />}

        {detail.score !== null && (
          <RecoveryScoreHero
            score={detail.score}
            confidence={detail.confidence}
            testID="recovery-hero"
          />
        )}

        {showDetail ? (
          <>
            <RecoveryGuidanceCard
              intensity={detail.recommendedIntensity}
              testID="recovery-guidance"
            />
            <RecoveryVitalsCard vitals={detail.vitals} testID="recovery-vitals" />
            {detail.score !== null && (
              <RecoveryContributorsCard score={detail.score} testID="recovery-contributors" />
            )}
            <RecoveryTrendCard
              trends={detail.trends}
              reducedMotion={isReducedMotion}
              testID="recovery-trend"
            />
          </>
        ) : (
          <Card testID="recovery-empty">
            <Text variant="bodyMedium" color="secondary">
              {resolveEmptyRecoveryMessage(detail.state)}
            </Text>
          </Card>
        )}

        <RecoveryAiSummaryCard testID="recovery-ai-summary" />
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
