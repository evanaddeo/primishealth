/**
 * SleepContributorsCard — a simple, local Sleep Score breakdown (CU-063).
 *
 * Lists the precomputed score components with their sub-score and lets each row
 * expand to reveal its configured weight and contribution. This is intentionally
 * a LOCAL, lightweight breakdown — the full reusable score-explanation pattern
 * (weights/values/confidence/evidence shared across every score) lands in CU-068.
 *
 * No scoring math runs here: every number is read straight from the contract and
 * formatted by `sleepModel` (Scoring Spec §7.2 owns the computation).
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ScoreSnapshotDto } from '@primis/api-contracts';
import { Card, ProgressBar, Text, useTheme } from '@primis/design-system';

import { buildSleepContributorRows, type SleepContributorRow } from '../sleepModel';

export interface SleepContributorsCardProps {
  score: ScoreSnapshotDto;
  testID?: string;
}

export function SleepContributorsCard({
  score,
  testID,
}: SleepContributorsCardProps): React.JSX.Element | null {
  const { colors, spacing } = useTheme();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const rows = buildSleepContributorRows(score);
  if (rows.length === 0) return null;

  const toggle = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        WHAT SHAPED YOUR SCORE
      </Text>
      <View style={{ marginTop: spacing.sm }}>
        {rows.map((row) => (
          <ContributorRow
            key={row.key}
            row={row}
            isExpanded={expanded.has(row.key)}
            onToggle={() => toggle(row.key)}
            barColor={colors.accent}
            dividerColor={colors.borderSubtle}
          />
        ))}
      </View>
    </Card>
  );
}

interface ContributorRowProps {
  row: SleepContributorRow;
  isExpanded: boolean;
  onToggle: () => void;
  barColor: string;
  dividerColor: string;
}

function ContributorRow({
  row,
  isExpanded,
  onToggle,
  barColor,
  dividerColor,
}: ContributorRowProps): React.JSX.Element {
  const { spacing } = useTheme();

  const valueText = row.isMissing ? (row.missingReasonLabel ?? 'No data') : String(row.value);
  const a11y = `${row.label}, ${
    row.isMissing ? valueText : `${row.value} out of 100`
  }. Weight ${row.weightPct} percent. Tap to ${isExpanded ? 'collapse' : 'expand'}.`;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ expanded: isExpanded }}
      style={({ pressed }) => [
        styles.row,
        {
          borderTopColor: dividerColor,
          paddingVertical: spacing.sm,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={[styles.rowHeader, { gap: spacing.sm }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Text variant="bodyMedium" weight="medium" style={styles.rowLabel}>
          {row.label}
        </Text>
        <Text variant="bodyMedium" color={row.isMissing ? 'muted' : 'secondary'}>
          {row.isMissing ? valueText : `${row.value}`}
        </Text>
      </View>

      {!row.isMissing && row.value !== null && (
        <View style={{ marginTop: spacing.xs }} importantForAccessibility="no-hide-descendants">
          <ProgressBar value={row.value} color={barColor} accessible={false} />
        </View>
      )}

      {isExpanded && (
        <View
          style={[styles.detail, { marginTop: spacing.sm, gap: spacing.xxs }]}
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="caption" color="muted">
            Weight: {row.weightPct}% of the Sleep Score
          </Text>
          <Text variant="caption" color="muted">
            {row.contribution !== null
              ? `Contributing ${row.contribution.toFixed(1)} points`
              : 'Not contributing — input missing this night'}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    flexShrink: 1,
  },
  detail: {},
});
