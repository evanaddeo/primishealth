/**
 * Activity screen components — public surface (CU-066).
 *
 * Each component is presentational and token-driven; all data arrives precomputed
 * from the Phase F `ActivityDetailResponseDto` via `useActivityDetail`.
 */

export { ActivityBanner } from './ActivityBanner';
export type { ActivityBannerProps } from './ActivityBanner';

export { ActivityScoreHero } from './ActivityScoreHero';
export type { ActivityScoreHeroProps } from './ActivityScoreHero';

export { ActivityMovementCard } from './ActivityMovementCard';
export type { ActivityMovementCardProps } from './ActivityMovementCard';

export { ActivityCaloriesCard } from './ActivityCaloriesCard';
export type { ActivityCaloriesCardProps } from './ActivityCaloriesCard';

export { ActivityWorkoutsCard } from './ActivityWorkoutsCard';
export type { ActivityWorkoutsCardProps } from './ActivityWorkoutsCard';

export { ActivityLoadCard } from './ActivityLoadCard';
export type { ActivityLoadCardProps } from './ActivityLoadCard';

export { ActivityContributorsCard } from './ActivityContributorsCard';
export type { ActivityContributorsCardProps } from './ActivityContributorsCard';

export { ActivityAiSummaryCard } from './ActivityAiSummaryCard';
export type { ActivityAiSummaryCardProps } from './ActivityAiSummaryCard';
