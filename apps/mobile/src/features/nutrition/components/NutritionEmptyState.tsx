import React from 'react';

import { DataStatePanel } from '../../../components/DataStatePanel';

export interface NutritionEmptyStateProps {
  readonly testID?: string;
}

export function NutritionEmptyState({ testID }: NutritionEmptyStateProps): React.JSX.Element {
  return (
    <DataStatePanel
      state="empty"
      title="Nothing logged yet today"
      body="Nutrition is optional and fast — log water, caffeine, or a meal with Quick Add above. Manual macros remain labeled as estimates."
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
