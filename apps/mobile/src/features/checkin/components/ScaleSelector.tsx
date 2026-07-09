/**
 * ScaleSelector — a labelled, optional subjective scale (CU-074).
 *
 * Wraps the design-system SegmentedControl with end-point captions (e.g.
 * "Drained → Energized") for sighted context. The field is optional: tapping the
 * already-selected segment clears it, so a user can leave any scale blank and
 * still finish the check-in quickly (UX-INPUT-001).
 */

import React from 'react';
import { View } from 'react-native';

import { SegmentedControl, Text, useTheme } from '@primis/design-system';

import type { ScaleOption } from '../checkinModel';

export interface ScaleSelectorProps {
  label: string;
  options: readonly ScaleOption[];
  value: number | null;
  onChange: (value: number | undefined) => void;
  lowLabel?: string;
  highLabel?: string;
  testID?: string;
}

export function ScaleSelector({
  label,
  options,
  value,
  onChange,
  lowLabel,
  highLabel,
  testID,
}: ScaleSelectorProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <SegmentedControl<number>
        label={label}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        value={value}
        // Tap-to-clear keeps the field truly optional.
        onChange={(v) => onChange(v === value ? undefined : v)}
        {...(testID !== undefined ? { testID } : {})}
      />
      {(lowLabel !== undefined || highLabel !== undefined) && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" color="muted">
            {lowLabel ?? ''}
          </Text>
          <Text variant="caption" color="muted">
            {highLabel ?? ''}
          </Text>
        </View>
      )}
    </View>
  );
}
