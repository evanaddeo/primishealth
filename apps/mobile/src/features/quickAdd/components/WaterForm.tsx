/**
 * WaterForm — one-tap hydration logging (CU-074, UX-NUT-001).
 *
 * Presets log in ≤2 taps; a stepper covers custom amounts. The unit toggle
 * (ml / fl oz) is sent to the server, which normalizes to canonical milliliters.
 */

import React, { useState } from 'react';
import { View } from 'react-native';

import type { HydrationUnit } from '@primis/api-contracts';
import {
  Button,
  Chip,
  ChipRow,
  NumberStepper,
  SegmentedControl,
  Text,
  useTheme,
} from '@primis/design-system';

import {
  HYDRATION_PRESETS_FL_OZ,
  HYDRATION_PRESETS_ML,
  buildHydrationRequest,
} from '../quickAddModel';
import type { QuickAddFormProps } from './types';

export function WaterForm({
  controller,
  buildAnchors,
  onLogged,
}: QuickAddFormProps): React.JSX.Element {
  const { spacing } = useTheme();
  const [unit, setUnit] = useState<HydrationUnit>('ml');
  const [amount, setAmount] = useState<number>(unit === 'ml' ? 500 : 16);

  const presets = unit === 'ml' ? HYDRATION_PRESETS_ML : HYDRATION_PRESETS_FL_OZ;
  const step = unit === 'ml' ? 50 : 1;

  async function log(value: number): Promise<void> {
    const ok = await controller.logWater(
      buildHydrationRequest({ amount: value, unit, beverageType: 'water' }, buildAnchors()),
    );
    if (ok) onLogged(`Logged ${value} ${unit === 'ml' ? 'ml' : 'fl oz'} of water`);
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <SegmentedControl<HydrationUnit>
        label="Unit"
        options={[
          { value: 'ml', label: 'ml' },
          { value: 'fl_oz', label: 'fl oz' },
        ]}
        value={unit}
        onChange={(u) => {
          setUnit(u);
          setAmount(u === 'ml' ? 500 : 16);
        }}
        testID="water-unit"
      />

      <View style={{ gap: spacing.sm }}>
        <Text variant="bodySmall" weight="semibold" color="secondary">
          Quick amounts
        </Text>
        <ChipRow>
          {presets.map((p) => (
            <Chip
              key={p}
              label={`${p} ${unit === 'ml' ? 'ml' : 'fl oz'}`}
              onPress={() => void log(p)}
              testID={`water-preset-${p}`}
            />
          ))}
        </ChipRow>
      </View>

      <NumberStepper
        label="Custom amount"
        value={amount}
        onChange={setAmount}
        min={step}
        max={unit === 'ml' ? 4000 : 128}
        step={step}
        unit={unit === 'ml' ? 'ml' : 'fl oz'}
        testID="water-amount"
      />

      <Button label="Log water" onPress={() => void log(amount)} disabled={controller.pending} />
    </View>
  );
}
