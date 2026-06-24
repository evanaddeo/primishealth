/**
 * Home widget registry (CU-061).
 *
 * Maps each canonical widget ID to its renderer. HomeScreen looks widgets up
 * here in the user's saved order; unknown IDs simply have no entry and are
 * skipped by `resolveVisibleWidgets`.
 */

import type React from 'react';

import type { HomeWidgetId } from '../homeModel';
import { CaloriesWidget } from './CaloriesWidget';
import { HrvTrendWidget } from './HrvTrendWidget';
import { RecommendationWidget } from './RecommendationWidget';
import { RecoveryScoreWidget } from './RecoveryScoreWidget';
import { SleepDebtWidget } from './SleepDebtWidget';
import { SleepScoreWidget } from './SleepScoreWidget';
import { StepsWidget } from './StepsWidget';
import { TrainingReadinessWidget } from './TrainingReadinessWidget';
import type { HomeWidgetProps } from './types';

export type HomeWidgetComponent = (props: HomeWidgetProps) => React.JSX.Element;

export const HOME_WIDGET_REGISTRY: Record<HomeWidgetId, HomeWidgetComponent> = {
  recovery_score: RecoveryScoreWidget,
  sleep_score: SleepScoreWidget,
  sleep_debt: SleepDebtWidget,
  steps_activity: StepsWidget,
  calories_burned: CaloriesWidget,
  training_readiness: TrainingReadinessWidget,
  hrv_trend: HrvTrendWidget,
  todays_recommendation: RecommendationWidget,
};

export type { HomeWidgetProps } from './types';
