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
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Card, Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useRecoveryDetail } from '../../api/hooks/useRecoveryDetail';
import { DataStatePanel } from '../../components/DataStatePanel';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import { MissingMetricMessage } from '../../components/MissingMetricMessage';
import { dataStateFromScoreState } from '../../components/dataStateModel';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { VITALS_ROUTE } from '../vitals/routes';
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
  const { spacing } = useTheme();
  const router = useRouter();
  const { getTimingConfig, isReducedMotion } = useReducedMotion();
  const { detail, status, isRefreshing, hasRefreshError, refetch } = useRecoveryDetail();

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
        <DataStatePanel
          state={status === 'error' ? 'api_error' : 'initial_loading'}
          title={status === 'error' ? 'Couldn’t load your recovery' : 'Loading today’s recovery'}
          {...(status === 'error' ? { onAction: () => void refetch() } : {})}
          testID={status === 'error' ? 'recovery-error' : 'recovery-loading'}
        />
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

        {isRefreshing && <DataStatusBanner state="refreshing" testID="recovery-refreshing" />}
        {hasRefreshError && (
          <DataStatusBanner
            state="api_error"
            title="Couldn’t update recovery"
            body="Showing your latest saved recovery data."
            onAction={() => void refetch()}
            testID="recovery-refresh-error"
          />
        )}

        {banner !== null && (
          <RecoveryBanner
            banner={banner}
            onAction={() => void refetch()}
            testID="recovery-banner"
          />
        )}

        {detail.score !== null && (
          <RecoveryScoreHero
            score={detail.score}
            confidence={detail.confidence}
            testID="recovery-hero"
          />
        )}

        {detail.score !== null && detail.score.missingMetrics.length > 0 && (
          <View style={{ gap: spacing.sm }} testID="recovery-missing-metrics">
            {detail.score.missingMetrics.map((metric) => (
              <MissingMetricMessage key={metric.metricCode} metric={metric} />
            ))}
          </View>
        )}

        {showDetail ? (
          <>
            <RecoveryGuidanceCard
              intensity={detail.recommendedIntensity}
              testID="recovery-guidance"
            />
            <RecoveryVitalsCard vitals={detail.vitals} testID="recovery-vitals" />
            <Pressable
              onPress={() => router.navigate(VITALS_ROUTE)}
              accessibilityRole="button"
              accessibilityLabel="View all vitals"
              accessibilityHint="Opens HRV, resting heart rate, SpO₂, respiratory rate, and VO₂ max with trends"
              style={styles.linkPressable}
              testID="recovery-vitals-link"
            >
              <Card>
                <View style={styles.linkRow}>
                  <View style={styles.linkText}>
                    <Text variant="bodyLarge" weight="semibold">
                      View all vitals
                    </Text>
                    <Text variant="bodySmall" color="secondary">
                      HRV, resting HR, SpO₂, respiratory rate, VO₂ max
                    </Text>
                  </View>
                  <Text variant="titleMedium" color="accent">
                    ›
                  </Text>
                </View>
              </Card>
            </Pressable>
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
          <DataStatePanel
            state={dataStateFromScoreState(detail.state) ?? 'empty'}
            title="Recovery data unavailable"
            body={resolveEmptyRecoveryMessage(detail.state)}
            {...(detail.state === 'provider_unavailable' || detail.state === 'calculation_error'
              ? { onAction: () => void refetch() }
              : {})}
            testID="recovery-empty"
          />
        )}

        <RecoveryAiSummaryCard sourceDate={detail.localDate} testID="recovery-ai-summary" />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkPressable: {
    minHeight: 44,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkText: {
    flexShrink: 1,
  },
});
