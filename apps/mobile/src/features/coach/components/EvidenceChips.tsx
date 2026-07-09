/**
 * EvidenceChips — the "Based on…" evidence section for an AI answer (UX-AI-002).
 *
 * Renders the compact evidence statements the backend attached to a health-data
 * answer. Each chip states its claim in plain text and shows a confidence label
 * — never color alone (UX-COLOR-001). Mobile only renders backend-provided
 * evidence; it never fabricates or computes it (AI spec §22.1).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { AiChatEvidenceChip } from '@primis/api-contracts';
import { Text, useTheme } from '@primis/design-system';

export interface EvidenceChipsProps {
  evidence: readonly AiChatEvidenceChip[];
  testID?: string;
}

const CONFIDENCE_LABEL: Record<AiChatEvidenceChip['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  not_enough_data: 'Limited data',
};

export function EvidenceChips({ evidence, testID }: EvidenceChipsProps): React.JSX.Element | null {
  const { colors, radius, spacing } = useTheme();

  if (evidence.length === 0) {
    return null;
  }

  const dotColor = (confidence: AiChatEvidenceChip['confidence']): string => {
    switch (confidence) {
      case 'high':
        return colors.status.good;
      case 'medium':
        return colors.status.caution;
      default:
        return colors.status.neutral;
    }
  };

  return (
    <View testID={testID} style={{ gap: spacing.xs, marginTop: spacing.sm }}>
      <Text variant="caption" color="muted" weight="semibold" style={styles.eyebrow}>
        BASED ON
      </Text>
      <View style={{ gap: spacing.xs }}>
        {evidence.map((chip) => (
          <View
            key={chip.id}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Evidence: ${chip.statement}. ${CONFIDENCE_LABEL[chip.confidence]}.`}
            style={[
              styles.chip,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
                borderRadius: radius.sm,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.sm,
                gap: spacing.sm,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: dotColor(chip.confidence) }]} />
            <View style={styles.chipBody}>
              <Text variant="caption" color="secondary">
                {chip.statement}
              </Text>
              <Text variant="caption" color="muted">
                {CONFIDENCE_LABEL[chip.confidence]}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipBody: {
    flex: 1,
    gap: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 5,
  },
});
