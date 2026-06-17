/**
 * SleepScoreWidget — last night's Sleep score (CU-061).
 */

import React from 'react';

import { HOME_WIDGET_META } from '../homeModel';
import { CompactScoreWidget } from './CompactScoreWidget';
import type { HomeWidgetProps } from './types';

export function SleepScoreWidget({
  snapshot,
  onPress,
  testID,
}: HomeWidgetProps): React.JSX.Element {
  const meta = HOME_WIDGET_META.sleep_score;
  return (
    <CompactScoreWidget
      title={meta.title}
      label="Sleep Score"
      score={snapshot.dashboard.scores.sleep}
      onPress={onPress}
      testID={testID}
    />
  );
}
