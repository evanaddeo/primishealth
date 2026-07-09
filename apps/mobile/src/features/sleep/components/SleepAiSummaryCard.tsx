/**
 * SleepAiSummaryCard — AI sleep summary slot + contextual entry point (CU-063 / CU-085).
 *
 * The generated summary itself is still Phase-J read-wiring, so the body stays a
 * placeholder. CU-085 enables the contextual "Ask AI about this" action: it opens
 * the AI Coach with a prefilled sleep question and the night's date, and makes NO
 * model call on render (AI Context Engine spec §22.1).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import { AskAiButton } from '../../../components/AskAiButton';

export interface SleepAiSummaryCardProps {
  /** Local date (YYYY-MM-DD) this night's detail represents, forwarded to Coach. */
  sourceDate?: string;
  testID?: string;
}

export function SleepAiSummaryCard({
  sourceDate,
  testID,
}: SleepAiSummaryCardProps): React.JSX.Element {
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
        Your personalized sleep summary will appear here soon. In the meantime, ask the Coach about
        what shaped last night&apos;s sleep.
      </Text>

      <View style={{ marginTop: spacing.md }}>
        <AskAiButton
          surface="sleep_detail"
          {...(sourceDate !== undefined ? { sourceDate } : {})}
          testID="sleep-ask-ai"
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
