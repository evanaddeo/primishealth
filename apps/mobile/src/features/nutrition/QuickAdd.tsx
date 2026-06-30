/**
 * Nutrition QuickAdd — the Nutrition surface's entry point into the global
 * quick-add sheet (CU-074).
 *
 * The Nutrition tab dashboard itself ships in CU-075; this thin wrapper exists
 * now so that surface can drop in fast logging without re-implementing inputs —
 * it simply re-themes the shared {@link QuickAddLauncher} with a nutrition label.
 *
 * @see apps/mobile/src/features/quickAdd/QuickAddSheet.tsx — the shared sheet
 */

import React from 'react';

import { QuickAddLauncher } from '../quickAdd';

export interface NutritionQuickAddProps {
  testID?: string;
}

export function NutritionQuickAdd({ testID }: NutritionQuickAddProps): React.JSX.Element {
  return (
    <QuickAddLauncher
      label="Log water, caffeine, macros…"
      variant="primary"
      testID={testID ?? 'nutrition-quick-add'}
    />
  );
}
