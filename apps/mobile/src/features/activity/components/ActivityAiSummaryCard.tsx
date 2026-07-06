/**
 * ActivityAiSummaryCard — AI activity summary slot + contextual entry point (CU-066 / CU-085).
 *
 * The generated summary itself is still Phase-J read-wiring, so the body stays a
 * placeholder. CU-085 enables the contextual "Ask AI about this" action: it opens
 * the AI Coach with a prefilled activity question and the day's date, and makes NO
 * model call on render (AI Context Engine spec §22.1).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import { AskAiButton } from '../../../components/AskAiButton';

export interface ActivityAiSummaryCardProps {
  /** Local date (YYYY-MM-DD) this activity detail represents, forwarded to Coach. */
  sourceDate?: string;
  testID?: string;
}

export function ActivityAiSummaryCard({
  sourceDate,
  testID,
}: ActivityAiSummaryCardProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <View style={styles.header}>
        <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
          COACH SUMMARY
        </Text>
        <Text variant="caption" color="muted">
          Coming soon
        </Text>
      </View>

      <Text variant="bodyMedium" color="secondary" style={{ marginTop: spacing.sm }}>
        Your personalized activity summary will appear here soon. In the meantime, ask the Coach
        about how your activity is trending.
      </Text>

      <View style={{ marginTop: spacing.md }}>
        <AskAiButton
          surface="activity_detail"
          {...(sourceDate !== undefined ? { sourceDate } : {})}
          testID="activity-ask-ai"
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
