/**
 * StatusBadge — maps a score band or score state to a semantic color chip.
 *
 * Always renders a text label alongside color — never color-only (UX-COLOR-001).
 * The 'low' status maps to orange, not red, to avoid medical panic framing (UX-COLOR-002).
 *
 * Status types supported:
 *   - ScoreBand:  excellent | good | moderate | low | very_low
 *   - ScoreState: available | provisional | not_enough_data | missing_required_data |
 *                 stale_data | provider_unavailable | calculation_error
 *   - 'unknown':  fallback for unresolvable status
 *
 * UX-COMP-001: No scoring or domain logic — purely presentational.
 */

import React from 'react';
import { View, Text as RNText, StyleSheet } from 'react-native';

import {
  resolveStatusLabel,
  resolveStatusForeground,
  resolveStatusBackground,
  type StatusBadgeStatus,
} from '../utils/componentResolvers.js';
import { useTheme } from '../ThemeContext.js';

export { resolveStatusLabel, resolveStatusForeground, resolveStatusBackground };
export type { StatusBadgeStatus };

export interface StatusBadgeProps {
  status: StatusBadgeStatus;
  /** Custom display label. Auto-generated from status if omitted. */
  label?: string;
  testID?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StatusBadge({ status, label, testID }: StatusBadgeProps): React.JSX.Element {
  const { colors, radius, typography } = useTheme();

  const displayLabel = label ?? resolveStatusLabel(status);
  const bgColor = resolveStatusBackground(status, colors.status);
  const fgColor = resolveStatusForeground(status, colors.status);

  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: bgColor, borderRadius: radius.pill }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Status: ${displayLabel}`}
    >
      <RNText
        style={[
          styles.label,
          {
            color: fgColor,
            fontWeight: typography.weight.semibold as '600',
          },
        ]}
        allowFontScaling
      >
        {displayLabel}
      </RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
});
