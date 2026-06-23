/**
 * BedtimeWindowCard — one ranked bedtime window (CU-064).
 *
 * Presents a single recommendation as a WINDOW (a time range), never a single
 * "magic" minute (UX-BED-001): the label, the lights-out range, expected sleep
 * and cycles, the fall-asleep buffer, and plain-language rationale / tradeoffs.
 * The top-ranked "best" window gets a calm accent emphasis. Pure presentational —
 * every value arrives precomputed from the planner result.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import type { BedtimeWindow } from '../bedtimeContract';
import {
  formatClock12,
  formatDurationHours,
  formatWindowRange,
  resolveWindowAccessibilityLabel,
  resolveWindowLabel,
} from '../bedtimeModel';

export interface BedtimeWindowCardProps {
  window: BedtimeWindow;
  testID?: string;
}

export function BedtimeWindowCard({ window, testID }: BedtimeWindowCardProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();
  const isBest = window.label === 'best';
  const isEmergency = window.label === 'emergency';
  const range = formatWindowRange(window.bedtimeWindowStartLocal, window.bedtimeWindowEndLocal);

  return (
    <Card variant={isBest ? 'elevated' : 'default'} {...(testID !== undefined ? { testID } : {})}>
      <View
        accessible
        accessibilityLabel={resolveWindowAccessibilityLabel(window)}
        style={{ gap: spacing.sm }}
      >
        <View style={styles.headerRow}>
          <View
            style={[
              styles.labelChip,
              {
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: isBest ? colors.accent : colors.borderSubtle,
                paddingVertical: spacing.xxs,
                paddingHorizontal: spacing.sm,
              },
            ]}
          >
            <Text
              variant="caption"
              weight="semibold"
              color={isBest ? 'accent' : isEmergency ? 'muted' : 'secondary'}
            >
              {resolveWindowLabel(window.label)}
            </Text>
          </View>
          <Text variant="bodySmall" color="muted">
            ~{formatDurationHours(window.expectedSleepDurationHours)} · {window.expectedCycles}{' '}
            cycles
          </Text>
        </View>

        <View style={{ gap: spacing.xxs }}>
          <Text variant="caption" color="muted">
            Lights-out window
          </Text>
          <Text variant="titleMedium" weight="semibold">
            {range}
          </Text>
          <Text variant="caption" color="muted">
            Aim for around {formatClock12(window.lightsOutTargetLocal)} · about{' '}
            {window.expectedSleepLatencyMinutes} min to fall asleep
          </Text>
        </View>

        {(window.rationale.length > 0 || window.tradeoffs.length > 0) && (
          <View style={{ gap: spacing.xxs }}>
            {window.rationale.map((line) => (
              <Bullet key={line} text={line} dotColor={colors.accent} tone="primary" />
            ))}
            {window.tradeoffs.map((line) => (
              <Bullet key={line} text={line} dotColor={colors.textMuted} tone="muted" />
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

interface BulletProps {
  text: string;
  dotColor: string;
  tone: 'primary' | 'muted';
}

function Bullet({ text, dotColor, tone }: BulletProps): React.JSX.Element {
  const { spacing } = useTheme();
  return (
    <View style={[styles.bulletRow, { gap: spacing.xs }]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text
        variant="bodySmall"
        color={tone === 'muted' ? 'muted' : 'secondary'}
        style={styles.bulletText}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelChip: {
    alignSelf: 'flex-start',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 7,
  },
  bulletText: {
    flexShrink: 1,
  },
});
