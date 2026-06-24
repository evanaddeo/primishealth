/**
 * ScoreDetailSheet — the reusable, AI-free score explanation surface (CU-068).
 *
 * A bottom-sheet modal any score card can open to explain a deterministic score
 * in seconds: headline value + band/state, plain-language state copy, evidence
 * chips (confidence / completeness / baseline / data quality / sync), the weighted
 * component breakdown, and the required/optional missing-data list. One surface is
 * shared across Sleep, Recovery, Training Readiness, Activity, and future scores.
 *
 * Presentational only — it reads a precomputed `ScoreSnapshotDto` and formats it
 * via `scoreExplanationModel`. No scoring math, no AI, and no raw provider payloads
 * or sensitive values are rendered — only the already-summarized score evidence.
 * Accessible modal behavior (focus-trapping modal flag, Android back to close,
 * 44pt close target) and reduced-motion-aware presentation.
 *
 * @see ./scoreExplanationModel.ts — buildScoreExplanation
 * @see UI/UX Spec — explainable score / detail sheet, evidence chips, a11y
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ScoreSnapshotDto } from '@primis/api-contracts';
import { Button, StatusBadge, Text, useTheme } from '@primis/design-system';

import { EvidenceChip } from './EvidenceChip';
import { ScoreContributorRows } from './ScoreContributorList';
import { buildScoreExplanation } from './scoreExplanationModel';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface ScoreDetailSheetProps {
  score: ScoreSnapshotDto;
  visible: boolean;
  onClose: () => void;
  testID?: string;
}

export function ScoreDetailSheet({
  score,
  visible,
  onClose,
  testID,
}: ScoreDetailSheetProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();
  const { isReducedMotion } = useReducedMotion();

  const vm = buildScoreExplanation(score);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isReducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      accessibilityViewIsModal
      {...(testID !== undefined ? { testID } : {})}
    >
      <View style={styles.fill}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          accessibilityRole="button"
          accessibilityLabel="Close score details"
          onPress={onClose}
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing.xl,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.borderSubtle }]} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={{ gap: spacing.sm }} accessible accessibilityLabel={vm.accessibilityLabel}>
              <View style={[styles.headerRow, { gap: spacing.sm }]}>
                <Text variant="titleMedium" style={styles.headerTitle}>
                  {vm.title} Score
                </Text>
                <StatusBadge status={vm.status} />
              </View>
              <View style={[styles.valueRow, { gap: spacing.xs }]}>
                <Text variant="displayMedium" weight="bold">
                  {vm.valueText}
                </Text>
                {vm.hasValue && (
                  <Text variant="bodyMedium" color="muted">
                    / 100
                  </Text>
                )}
              </View>
              <Text variant="bodySmall" color="secondary">
                {vm.confidenceLabel}
              </Text>
              <Text variant="bodyMedium" color="secondary">
                {vm.stateExplanation}
              </Text>
            </View>

            {/* Evidence chips */}
            {vm.evidence.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
                  WHY YOU CAN TRUST THIS
                </Text>
                <View style={[styles.chipWrap, { gap: spacing.sm }]}>
                  {vm.evidence.map((chip) => (
                    <EvidenceChip
                      key={chip.key}
                      chip={chip}
                      {...(testID !== undefined ? { testID: `${testID}-chip-${chip.key}` } : {})}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Component breakdown */}
            {vm.contributors.length > 0 && (
              <View style={{ gap: spacing.xs }}>
                <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
                  COMPONENT BREAKDOWN
                </Text>
                <ScoreContributorRows rows={vm.contributors} scoreNoun={vm.scoreNoun} />
              </View>
            )}

            {/* Missing data */}
            {vm.missingData.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
                  MISSING INPUTS
                </Text>
                {vm.missingData.map((row) => (
                  <View
                    key={row.key}
                    style={[styles.missingRow, { gap: spacing.xxs }]}
                    accessible
                    accessibilityLabel={`${row.label}, ${
                      row.isRequired ? 'required' : 'optional'
                    }${row.reasonLabel !== null ? `, ${row.reasonLabel}` : ''}`}
                  >
                    <View style={[styles.missingHeader, { gap: spacing.sm }]}>
                      <Text variant="bodyMedium" weight="medium" style={styles.rowLabel}>
                        {row.label}
                      </Text>
                      <Text variant="caption" color={row.isRequired ? 'secondary' : 'muted'}>
                        {row.isRequired ? 'Required' : 'Optional'}
                      </Text>
                    </View>
                    {row.reasonLabel !== null && (
                      <Text variant="caption" color="muted">
                        {row.reasonLabel}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            <Text variant="caption" color="muted">
              Explained from your synced data — no AI needed.
            </Text>
          </ScrollView>

          <Button
            variant="secondary"
            label="Close"
            onPress={onClose}
            {...(testID !== undefined ? { testID: `${testID}-close` } : {})}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    maxHeight: '88%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  scroll: {
    flexGrow: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flexShrink: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  eyebrow: {
    letterSpacing: 0.8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  missingRow: {},
  missingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    flexShrink: 1,
  },
});
