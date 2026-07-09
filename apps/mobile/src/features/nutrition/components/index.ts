/**
 * Nutrition screen components — public surface (CU-075).
 *
 * Each component is presentational and token-driven; all data arrives precomputed
 * from the Phase H nutrition/lifestyle DTOs via `useNutritionDetail` and is formatted
 * by the pure `nutritionModel` helpers. No scoring, AI, or heavy transforms run here.
 */

export { NutritionHero } from './NutritionHero';
export type { NutritionHeroProps } from './NutritionHero';

export { QuickAddRow } from './QuickAddRow';
export type { QuickAddRowProps } from './QuickAddRow';

export { MacroProgressCard } from './MacroProgressCard';
export type { MacroProgressCardProps } from './MacroProgressCard';

export { BehaviorInputsCard } from './BehaviorInputsCard';
export type { BehaviorInputsCardProps } from './BehaviorInputsCard';

export { MealTimingCard } from './MealTimingCard';
export type { MealTimingCardProps } from './MealTimingCard';

export { CorrelationsCard } from './CorrelationsCard';
export type { CorrelationsCardProps } from './CorrelationsCard';

export { ManualEstimateBadge } from './ManualEstimateBadge';
export type { ManualEstimateBadgeProps } from './ManualEstimateBadge';

export { NutritionBanner } from './NutritionBanner';
export type { NutritionBannerProps } from './NutritionBanner';

export { NutritionEmptyState } from './NutritionEmptyState';
export type { NutritionEmptyStateProps } from './NutritionEmptyState';
