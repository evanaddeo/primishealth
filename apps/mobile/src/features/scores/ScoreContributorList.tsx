/**
 * ScoreContributorList — the reusable score-breakdown card for the explanation
 * pattern (CU-068).
 *
 * Lists a snapshot's precomputed components (sub-score + weight bar) and lets each
 * row expand to reveal its configured weight and contribution points. A footer
 * action opens the full {@link ScoreDetailSheet}. This is the ONE shared
 * breakdown used by Sleep, Recovery, Activity, and future scores — the thin
 * per-feature `*ContributorsCard` wrappers delegate here so there is a single
 * implementation to maintain.
 *
 * Purely presentational: no scoring math runs here — every number is read from
 * the contract and formatted by `scoreExplanationModel` (Scoring Spec §7.2 owns
 * the computation; AI is never required to explain deterministic components).
 *
 * @see ./scoreExplanationModel.ts — buildScoreContributorRows
 * @see ./ScoreDetailSheet.tsx — the full detail surface this card opens
 */

import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ScoreSnapshotDto } from '@primis/api-contracts';
import { Card, ProgressBar, Text, useTheme } from '@primis/design-system';

import { ScoreDetailSheet } from './ScoreDetailSheet';
import {
  buildScoreContributorRows,
  resolveScoreTypeNoun,
  type ScoreContributorRow,
} from './scoreExplanationModel';

export interface ScoreContributorListProps {
  score: ScoreSnapshotDto;
  /** Section eyebrow, e.g. 'WHAT SHAPED YOUR SCORE'. Defaults from the score type. */
  heading?: string;
  testID?: string;
}

export function ScoreContributorList({
  score,
  heading,
  testID,
}: ScoreContributorListProps): React.JSX.Element | null {
  const { colors, spacing } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const detailButtonRef = useRef<View>(null);

  const rows = buildScoreContributorRows(score);
  const scoreNoun = resolveScoreTypeNoun(score.scoreType);
  const eyebrow = heading ?? `WHAT SHAPED YOUR ${scoreNoun.toUpperCase()}`;

  // With no components there is nothing to break down, but the detail sheet still
  // explains state / confidence / missing data — so offer it rather than render nothing.
  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        {eyebrow}
      </Text>

      {rows.length > 0 && (
        <View style={{ marginTop: spacing.sm }}>
          <ScoreContributorRows rows={rows} scoreNoun={scoreNoun} />
        </View>
      )}

      <Pressable
        ref={detailButtonRef}
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`See full ${scoreNoun} breakdown`}
        accessibilityHint="Opens components, confidence, and missing data for this score"
        style={({ pressed }) => [
          styles.detailAction,
          {
            borderTopColor: colors.borderSubtle,
            paddingTop: spacing.md,
            marginTop: spacing.md,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        {...(testID !== undefined ? { testID: `${testID}-open-detail` } : {})}
      >
        <Text variant="bodyMedium" weight="semibold" color="accent">
          See full breakdown
        </Text>
        <Text variant="titleMedium" color="accent">
          ›
        </Text>
      </Pressable>

      <ScoreDetailSheet
        score={score}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        returnFocusRef={detailButtonRef}
        {...(testID !== undefined ? { testID: `${testID}-sheet` } : {})}
      />
    </Card>
  );
}

// ── Shared row renderer (used by the list and the detail sheet) ───────────────

export interface ScoreContributorRowsProps {
  rows: readonly ScoreContributorRow[];
  /** Composite-score noun used in the expanded weight copy, e.g. 'Recovery Score'. */
  scoreNoun: string;
}

/** Render the expandable contributor rows. Presentational; no Card wrapper. */
export function ScoreContributorRows({
  rows,
  scoreNoun,
}: ScoreContributorRowsProps): React.JSX.Element {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <View>
      {rows.map((row) => (
        <ContributorRow
          key={row.key}
          row={row}
          scoreNoun={scoreNoun}
          isExpanded={expanded.has(row.key)}
          onToggle={() => toggle(row.key)}
          barColor={colors.accent}
          dividerColor={colors.borderSubtle}
        />
      ))}
    </View>
  );
}

interface ContributorRowProps {
  row: ScoreContributorRow;
  scoreNoun: string;
  isExpanded: boolean;
  onToggle: () => void;
  barColor: string;
  dividerColor: string;
}

function ContributorRow({
  row,
  scoreNoun,
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
            Weight: {row.weightPct}% of the {scoreNoun}
          </Text>
          <Text variant="caption" color="muted">
            {row.contribution !== null
              ? `Contributing ${row.contribution.toFixed(1)} points`
              : 'Not contributing — input missing'}
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
  detailAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
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
