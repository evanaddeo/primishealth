import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { AiSummaryType } from '@primis/api-contracts';
import { Card, Text, useTheme } from '@primis/design-system';

import { useAiSummary } from '../api/hooks/useAiSummary';
import { type AskAiSurface } from '../features/coach/contextualNavigation';
import { AskAiButton } from './AskAiButton';
import { DataStatusBanner } from './DataStatusBanner';

export interface AiSummaryCardProps {
  readonly summaryType: AiSummaryType;
  readonly surface: AskAiSurface;
  readonly sourceDate: string;
  readonly testID?: string;
  readonly askButtonTestID?: string;
}

/** Cached-summary-first card; AI loading/failure never blocks deterministic content. */
export function AiSummaryCard({
  summaryType,
  surface,
  sourceDate,
  testID,
  askButtonTestID,
}: AiSummaryCardProps): React.JSX.Element {
  const { spacing } = useTheme();
  const summary = useAiSummary(summaryType, sourceDate);

  return (
    <Card {...(testID === undefined ? {} : { testID })}>
      <View style={styles.header}>
        <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
          COACH SUMMARY
        </Text>
        {summary.summary !== null && (
          <Text variant="caption" color="muted">
            {summary.isFallback ? 'Saved' : 'Current'}
          </Text>
        )}
      </View>

      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
        {summary.isRefreshing && <DataStatusBanner state="refreshing" />}
        {summary.isFallback && (
          <DataStatusBanner
            state="cached_ai_summary"
            body={
              summary.fallbackReason === 'date_mismatch'
                ? `Showing the latest saved summary from ${summary.summary?.localDate ?? 'another day'}.`
                : summary.fallbackReason === 'refresh_error'
                  ? 'The latest saved summary remains visible while Coach updates are unavailable.'
                  : 'Coach marked this saved summary as stale; your deterministic data remains current below.'
            }
          />
        )}
        {summary.status === 'loading' && <DataStatusBanner state="ai_generating" />}
        {summary.status === 'error' && (
          <DataStatusBanner
            state="ai_generation_unavailable"
            onAction={() => void summary.refetch()}
          />
        )}
        {summary.status === 'empty' && (
          <DataStatusBanner
            state="empty"
            title="No Coach summary yet"
            body="Your scores and detail cards remain available while a summary is prepared."
          />
        )}

        {summary.summary !== null && (
          <>
            {summary.summary.title !== null && (
              <Text variant="bodyLarge" weight="semibold">
                {summary.summary.title}
              </Text>
            )}
            <Text variant="bodyMedium" color="secondary">
              {summary.summary.shortSummary ?? 'This saved summary has no display text.'}
            </Text>
            {summary.summary.evidence.length > 0 ? (
              <View style={{ gap: spacing.xxs }}>
                <Text variant="caption" color="muted" weight="semibold">
                  BASED ON
                </Text>
                {summary.summary.evidence.slice(0, 3).map((evidence) => (
                  <Text key={evidence.id} variant="bodySmall" color="secondary">
                    • {evidence.statement}
                  </Text>
                ))}
              </View>
            ) : (
              <DataStatusBanner
                state="missing_optional_metric"
                title="Evidence details unavailable"
                body="The saved summary did not include evidence labels, so treat it as limited context."
              />
            )}
          </>
        )}
      </View>

      <View style={{ marginTop: spacing.md }}>
        <AskAiButton
          surface={surface}
          sourceDate={sourceDate}
          {...(askButtonTestID === undefined ? {} : { testID: askButtonTestID })}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    letterSpacing: 0.8,
    flexShrink: 1,
  },
});
