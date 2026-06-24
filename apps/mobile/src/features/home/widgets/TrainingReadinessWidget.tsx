/**
 * TrainingReadinessWidget — today's training readiness score (CU-061).
 */

import React from 'react';

import { HOME_WIDGET_META } from '../homeModel';
import { CompactScoreWidget } from './CompactScoreWidget';
import type { HomeWidgetProps } from './types';

export function TrainingReadinessWidget({
  snapshot,
  onPress,
  testID,
}: HomeWidgetProps): React.JSX.Element {
  const meta = HOME_WIDGET_META.training_readiness;
  return (
    <CompactScoreWidget
      title={meta.title}
      label="Training Readiness"
      score={snapshot.dashboard.scores.trainingReadiness}
      onPress={onPress}
      testID={testID}
    />
  );
}
