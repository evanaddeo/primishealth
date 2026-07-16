/**
 * MacrosForm — manual calorie/macro logging (CU-074, CU-072 contract).
 *
 * Manual entry only — no food database (out of scope). Every value is optional;
 * a field left at 0 is treated as "not entered" and omitted from the request.
 * The entry is always stored as a manual estimate and labelled as such
 * (UX-NUT-003) so it never implies fake precision.
 */

import React, { useState } from 'react';
import { View } from 'react-native';

import type { MealType } from '@primis/api-contracts';
import { Button, NumberStepper, SegmentedControl, Text, useTheme } from '@primis/design-system';

import { MEAL_TYPES, buildNutritionEntryRequest, isMacroEntryEmpty } from '../quickAddModel';
import type { MacroFormState } from '../quickAddModel';
import type { QuickAddFormProps } from './types';

/** Map the numeric stepper state to the optional macro form state (0 → omitted). */
function toMacroState(
  values: { calories: number; protein: number; carbs: number; fat: number; fiber: number },
  mealType: MealType | null,
): MacroFormState {
  return {
    ...(mealType !== null && { mealType }),
    ...(values.calories > 0 && { calories: values.calories }),
    ...(values.protein > 0 && { protein: values.protein }),
    ...(values.carbs > 0 && { carbs: values.carbs }),
    ...(values.fat > 0 && { fat: values.fat }),
    ...(values.fiber > 0 && { fiber: values.fiber }),
  };
}

export function MacrosForm({
  controller,
  buildAnchors,
  onLogged,
}: QuickAddFormProps): React.JSX.Element {
  const { spacing } = useTheme();
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [fiber, setFiber] = useState(0);

  const state = toMacroState({ calories, protein, carbs, fat, fiber }, mealType);
  const empty = isMacroEntryEmpty(state);

  async function log(): Promise<void> {
    if (empty) return;
    const ok = await controller.logMacros(buildNutritionEntryRequest(state, buildAnchors()));
    if (ok) onLogged('Logged meal (manual estimate)');
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <SegmentedControl<MealType>
        label="Meal (optional)"
        options={MEAL_TYPES.slice(0, 4).map((m) => ({ value: m.value, label: m.label }))}
        value={mealType}
        onChange={(m) => setMealType(mealType === m ? null : m)}
        testID="macros-meal"
      />

      <NumberStepper
        label="Calories"
        value={calories}
        onChange={setCalories}
        min={0}
        max={5000}
        step={50}
        unit="kcal"
        testID="macros-calories"
      />
      <NumberStepper
        label="Protein"
        value={protein}
        onChange={setProtein}
        min={0}
        max={400}
        step={5}
        unit="g"
        testID="macros-protein"
      />
      <NumberStepper
        label="Carbs"
        value={carbs}
        onChange={setCarbs}
        min={0}
        max={600}
        step={5}
        unit="g"
        testID="macros-carbs"
      />
      <NumberStepper
        label="Fat"
        value={fat}
        onChange={setFat}
        min={0}
        max={300}
        step={5}
        unit="g"
        testID="macros-fat"
      />
      <NumberStepper
        label="Fiber"
        value={fiber}
        onChange={setFiber}
        min={0}
        max={200}
        step={1}
        unit="g"
        testID="macros-fiber"
      />

      <Text variant="caption" color="muted">
        Saved as a manual estimate — no food database needed.
      </Text>

      <Button
        label={controller.pending ? 'Saving meal…' : 'Log meal'}
        onPress={() => void log()}
        disabled={empty || controller.pending}
        busy={controller.pending}
        {...(empty
          ? { accessibilityHint: 'Enter a meal type or at least one nutrition value' }
          : {})}
      />
    </View>
  );
}
