/**
 * EvidenceChip — a compact, token-driven "evidence" pill for the reusable score
 * explanation pattern (CU-068).
 *
 * Summarizes a single trust signal behind a score (state, confidence, input
 * completeness, baseline readiness, data quality, sync freshness). The tone color
 * is purely decorative — the label and value text always carry the meaning, so a
 * chip never communicates by color alone (UX-COLOR-001). Purely presentational:
 * it receives a fully-formatted `EvidenceChipVm` and renders it.
 *
 * @see ./scoreExplanationModel.ts — buildEvidenceChips / EvidenceChipVm
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { EvidenceChipVm, EvidenceTone } from './scoreExplanationModel';

export interface EvidenceChipProps {
  chip: EvidenceChipVm;
  testID?: string;
}

export function EvidenceChip({ chip, testID }: EvidenceChipProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  const toneColor = resolveToneColor(chip.tone, colors);

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: `${toneColor}1F`,
          borderRadius: radius.sm,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          gap: spacing.xs,
        },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={chip.accessibilityLabel}
      {...(testID !== undefined ? { testID } : {})}
    >
      <View style={[styles.dot, { backgroundColor: toneColor }]} importantForAccessibility="no" />
      <Text variant="caption" color="muted">
        {chip.label}
      </Text>
      <Text variant="caption" weight="semibold">
        {chip.value}
      </Text>
    </View>
  );
}

/** Map a decorative tone to a semantic status / accent color token. */
function resolveToneColor(
  tone: EvidenceTone,
  colors: ReturnType<typeof useTheme>['colors'],
): string {
  switch (tone) {
    case 'positive':
      return colors.status.good;
    case 'caution':
      return colors.status.caution;
    case 'attention':
      return colors.status.attention;
    case 'info':
      return colors.accent;
    case 'neutral':
      return colors.status.neutral;
  }
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
