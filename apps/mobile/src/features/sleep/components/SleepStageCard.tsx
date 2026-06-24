/**
 * SleepStageCard — the sleep stage timeline section for the Sleep screen (CU-063).
 *
 * Renders the precomputed stage segments through the design-system StageTimeline
 * (Google-Health-class richness, original Primis visual language). It NEVER
 * fabricates stage data: when a provider supplies no intervals (classic tracker)
 * or stages are still processing, it shows an explanatory message instead of
 * inventing segments (UX-SLEEP-001).
 *
 * All values arrive precomputed; the only adaptation here is the API→chart shape
 * mapping done in `sleepModel` (durationSeconds → durationMs).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { SleepDetailResponseDto } from '@primis/api-contracts';
import { Card, StageTimeline, Text, useTheme } from '@primis/design-system';

import {
  formatClockTime,
  resolveStageAccessibilityLabel,
  resolveStageTimelineState,
  resolveStageTotalDurationMs,
  resolveStageUnavailableMessage,
  toStageLegendSummaries,
} from '../sleepModel';

export interface SleepStageCardProps {
  detail: SleepDetailResponseDto;
  reducedMotion?: boolean;
  testID?: string;
}

export function SleepStageCard({
  detail,
  reducedMotion = false,
  testID,
}: SleepStageCardProps): React.JSX.Element {
  const { spacing } = useTheme();

  const chartState = resolveStageTimelineState(detail);
  const summary = detail.summary;

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        SLEEP STAGES
      </Text>

      {chartState === 'data' ? (
        <View style={{ marginTop: spacing.md }}>
          <StageTimeline
            segments={detail.stages.timeline}
            totalDurationMs={resolveStageTotalDurationMs(detail.stages.timeline)}
            state="data"
            variant="detailed"
            stageSummaries={toStageLegendSummaries(detail.stages.summary)}
            startTimeLabel={formatClockTime(summary?.bedtimeLocal ?? null)}
            midpointTimeLabel={formatClockTime(summary?.midpointLocal ?? null)}
            endTimeLabel={formatClockTime(summary?.wakeTimeLocal ?? null)}
            reducedMotion={reducedMotion}
            accessibilityLabel={resolveStageAccessibilityLabel(detail)}
          />
        </View>
      ) : (
        <Text variant="bodyMedium" color="muted" style={{ marginTop: spacing.sm }}>
          {resolveStageUnavailableMessage(detail.state)}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
});
