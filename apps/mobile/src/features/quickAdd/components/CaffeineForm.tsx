/**
 * CaffeineForm — quick caffeine logging with rounded presets (CU-074).
 *
 * Presets log a typical estimate in one tap (Phase H plan Q2); the stepper
 * fine-tunes the dose. Doses are honest estimates — `estimated: true` — never
 * presented as precise.
 */

import React, { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ChipRow, NumberStepper, Text, useTheme } from '@primis/design-system';

import { CAFFEINE_PRESETS, buildCaffeineRequest } from '../quickAddModel';
import type { CaffeinePreset } from '../quickAddModel';
import type { QuickAddFormProps } from './types';

export function CaffeineForm({
  controller,
  buildAnchors,
  onLogged,
}: QuickAddFormProps): React.JSX.Element {
  const { spacing } = useTheme();
  const [mg, setMg] = useState<number>(95);

  async function logPreset(preset: CaffeinePreset): Promise<void> {
    const ok = await controller.logCaffeine(
      buildCaffeineRequest(
        { caffeineMg: preset.mg, beverageType: preset.beverageType, estimated: true },
        buildAnchors(),
      ),
    );
    if (ok) onLogged(`Logged ${preset.label} (~${preset.mg} mg)`);
  }

  async function logCustom(): Promise<void> {
    const ok = await controller.logCaffeine(
      buildCaffeineRequest({ caffeineMg: mg, estimated: true }, buildAnchors()),
    );
    if (ok) onLogged(`Logged ${mg} mg caffeine`);
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Text variant="bodySmall" weight="semibold" color="secondary">
          Common drinks (estimated)
        </Text>
        <ChipRow>
          {CAFFEINE_PRESETS.map((p) => (
            <Chip
              key={p.beverageType}
              label={`${p.label} · ${p.mg} mg`}
              onPress={() => void logPreset(p)}
              testID={`caffeine-preset-${p.beverageType}`}
            />
          ))}
        </ChipRow>
      </View>

      <NumberStepper
        label="Custom amount"
        value={mg}
        onChange={setMg}
        min={5}
        max={1000}
        step={5}
        unit="mg"
        testID="caffeine-amount"
      />

      <Button label="Log caffeine" onPress={() => void logCustom()} disabled={controller.pending} />
    </View>
  );
}
