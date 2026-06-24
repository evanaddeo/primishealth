/**
 * ActivityAiSummaryCard — placeholder slot for the AI activity summary (CU-066).
 *
 * Phase G performs NO model calls (Phase-Level Guardrail / AI Context Engine
 * spec). This card reserves the layout slot Phase I will fill with a real
 * generated explanation, so dropping in generation later requires no relayout.
 * The "Ask Coach" CTA is intentionally disabled until then (Open Question Q1).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text, useTheme } from '@primis/design-system';

export interface ActivityAiSummaryCardProps {
  testID?: string;
}

export function ActivityAiSummaryCard({ testID }: ActivityAiSummaryCardProps): React.JSX.Element {
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
        Your personalized activity summary will appear here once Coach is enabled.
      </Text>

      <View style={{ marginTop: spacing.md }}>
        <Button
          variant="secondary"
          label="Ask Coach"
          disabled
          onPress={() => {}}
          accessibilityHint="Coach is not available yet"
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
