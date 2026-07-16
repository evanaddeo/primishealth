/**
 * AlcoholForm — factual alcohol logging, recorded without judgment (CU-074).
 *
 * Uses the §15.2 range buckets (none / 1 / 2 / 3–4 / 5+) plus an optional type.
 * Copy is neutral and non-moralizing — this is performance context, not a verdict.
 */

import React, { useState } from 'react';
import { View } from 'react-native';

import type { AlcoholDrinkRange, AlcoholType } from '@primis/api-contracts';
import { Button, Chip, ChipRow, SegmentedControl, Text, useTheme } from '@primis/design-system';

import { ALCOHOL_RANGES, ALCOHOL_TYPES, buildAlcoholRequest } from '../quickAddModel';
import type { QuickAddFormProps } from './types';

export function AlcoholForm({
  controller,
  buildAnchors,
  onLogged,
}: QuickAddFormProps): React.JSX.Element {
  const { spacing } = useTheme();
  const [range, setRange] = useState<AlcoholDrinkRange>('none');
  const [type, setType] = useState<AlcoholType | null>(null);

  async function log(): Promise<void> {
    const ok = await controller.logAlcohol(
      buildAlcoholRequest(
        { drinkRange: range, ...(type !== null && { alcoholType: type }) },
        buildAnchors(),
      ),
    );
    if (ok) {
      const label = ALCOHOL_RANGES.find((r) => r.value === range)?.label ?? range;
      onLogged(`Logged ${label === 'None' ? 'no drinks' : `${label} drinks`}`);
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <SegmentedControl<AlcoholDrinkRange>
        label="How many drinks?"
        options={ALCOHOL_RANGES.map((r) => ({ value: r.value, label: r.label }))}
        value={range}
        onChange={setRange}
        testID="alcohol-range"
      />

      <View style={{ gap: spacing.sm }}>
        <Text variant="bodySmall" weight="semibold" color="secondary">
          Type (optional)
        </Text>
        <ChipRow>
          {ALCOHOL_TYPES.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              selected={type === t.value}
              onPress={() => setType(type === t.value ? null : t.value)}
              testID={`alcohol-type-${t.value}`}
            />
          ))}
        </ChipRow>
      </View>

      <Button
        label={controller.pending ? 'Saving drinks…' : 'Log drinks'}
        onPress={() => void log()}
        disabled={controller.pending}
        busy={controller.pending}
      />
    </View>
  );
}
