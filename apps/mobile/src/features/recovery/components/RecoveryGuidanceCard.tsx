/**
 * RecoveryGuidanceCard — training readiness + recommended intensity (CU-065).
 *
 * This is the "Today Guidance" block from UI/UX §6.4: a performance-only
 * readiness sentence plus the recommended training-intensity band. The Phase F
 * recovery contract does not carry a separate Training Readiness snapshot
 * (Scoring Spec §13 is Phase 2), so readiness is expressed through the
 * recommended-intensity level — they share the §13.4 intensity vocabulary.
 *
 * The four-level scale renders every option as a labelled segment with the
 * active one emphasized, so the recommendation is never conveyed by color alone
 * (UX-COLOR-001). Wording is moderate and never fearmongers (UX-REC-002/003).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecommendedIntensityDto, RecommendedIntensityLevel } from '@primis/api-contracts';
import { RECOMMENDED_INTENSITY_LEVELS } from '@primis/api-contracts';
import { Card, Text, useTheme } from '@primis/design-system';

import { resolveIntensityLevelLabel, resolveReadinessText } from '../recoveryModel';

export interface RecoveryGuidanceCardProps {
  intensity: RecommendedIntensityDto | null;
  testID?: string;
}

/** Compact per-segment label for the intensity scale. */
function segmentLabel(level: RecommendedIntensityLevel): string {
  switch (level) {
    case 'rest':
      return 'Rest';
    case 'light':
      return 'Light';
    case 'moderate':
      return 'Moderate';
    case 'high':
      return 'High';
  }
}

export function RecoveryGuidanceCard({
  intensity,
  testID,
}: RecoveryGuidanceCardProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  const readiness = resolveReadinessText(intensity);
  const activeLabel =
    intensity !== null ? intensity.label || resolveIntensityLevelLabel(intensity.level) : 'Pending';

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        TRAINING READINESS
      </Text>

      <Text
        variant="bodyLarge"
        weight="semibold"
        style={{ marginTop: spacing.sm }}
        accessibilityRole="text"
      >
        {readiness}
      </Text>

      <View
        style={[styles.scale, { marginTop: spacing.md, gap: spacing.xs }]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Recommended intensity: ${activeLabel}.`}
      >
        {RECOMMENDED_INTENSITY_LEVELS.map((level) => {
          const isActive = intensity !== null && intensity.level === level;
          return (
            <View
              key={level}
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.segment,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: isActive ? colors.accent : colors.borderSubtle,
                  borderRadius: radius.sm,
                  paddingVertical: spacing.sm,
                  gap: spacing.xxs,
                },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isActive ? colors.accent : colors.borderSubtle },
                ]}
              />
              <Text
                variant="caption"
                weight={isActive ? 'semibold' : 'regular'}
                color={isActive ? 'accent' : 'muted'}
                style={styles.segmentLabel}
              >
                {segmentLabel(level)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text variant="caption" color="muted" style={{ marginTop: spacing.sm }}>
        Recommended today: {activeLabel}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  scale: {
    flexDirection: 'row',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  segmentLabel: {
    textAlign: 'center',
  },
});
