/**
 * BedtimeNotesCard — the "why these windows" explainer (CU-064).
 *
 * Surfaces the four plain-language notes the planner must show (UX-BED-003):
 * latency adjustment, sleep debt, circadian consistency, and recovery need —
 * plus the overall confidence and the always-present caveats (including the
 * sleep-cycle uncertainty disclaimer, UX-BED-001). All copy is non-medical and
 * keeps the "windows, not certainty" framing.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import type { BedtimePlannerResult } from '../bedtimeContract';
import { resolveConfidenceLabel } from '../bedtimeModel';

export interface BedtimeNotesCardProps {
  plan: BedtimePlannerResult;
  testID?: string;
}

interface NoteRow {
  readonly key: string;
  readonly label: string;
  readonly text: string;
}

function buildNoteRows(plan: BedtimePlannerResult): NoteRow[] {
  return [
    { key: 'latency', label: 'Falling asleep', text: plan.notes.latencyNote },
    { key: 'debt', label: 'Sleep debt', text: plan.notes.sleepDebtNote },
    { key: 'circadian', label: 'Your rhythm', text: plan.notes.circadianNote },
    { key: 'recovery', label: 'Recovery', text: plan.notes.recoveryNote },
  ];
}

export function BedtimeNotesCard({ plan, testID }: BedtimeNotesCardProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const rows = buildNoteRows(plan);
  const confidenceLabel = resolveConfidenceLabel(plan.confidence);

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <View style={styles.header}>
        <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
          HOW WE GOT HERE
        </Text>
        <View accessible accessibilityLabel={`Plan confidence: ${confidenceLabel}`}>
          <Text variant="caption" color="muted">
            {confidenceLabel}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
        {rows.map((row) => (
          <View
            key={row.key}
            accessible
            accessibilityLabel={`${row.label}. ${row.text}`}
            style={{ gap: spacing.xxs }}
          >
            <Text variant="bodySmall" weight="semibold" color="secondary">
              {row.label}
            </Text>
            <Text variant="bodyMedium">{row.text}</Text>
          </View>
        ))}
      </View>

      {plan.caveats.length > 0 && (
        <View
          style={[
            styles.caveats,
            { marginTop: spacing.md, paddingTop: spacing.sm, borderTopColor: colors.borderSubtle },
          ]}
        >
          {plan.caveats.map((caveat) => (
            <Text
              key={caveat}
              variant="caption"
              color="muted"
              style={{ marginBottom: spacing.xxs }}
            >
              {caveat}
            </Text>
          ))}
        </View>
      )}
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
  },
  caveats: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
