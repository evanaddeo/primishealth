/**
 * NutritionScreen — the Nutrition tab v1 (CU-075).
 *
 * A practical, performance-oriented dashboard for MANUAL macros and lifestyle
 * inputs — not a food database. Renders the Phase H nutrition + lifestyle DTOs into
 * the §6.6.4 layout: one hero (calories / protein / hydration), Quick Add, macro
 * energy split, behavior inputs (caffeine / alcohol / tags), meal timing, and a
 * non-AI correlations slot. It composes the read contracts via `useNutritionDetail`
 * and reuses the CU-074 QuickAdd sheet for fast logging (UX-NUT-001).
 *
 * Honesty + tone (Phase H §7, UX-NUT-003): manual macros are clearly labeled
 * estimates; missing values are em dashes, never fabricated zeros; copy never
 * shames a missed log; no food-search UI; no medical/diagnostic language. Loading
 * renders cached-first (no blank spinner once mock/cache data exists); empty and
 * stale states are polished. No scoring, AI, or heavy transforms on the render path
 * — values arrive precomputed and pure helpers format them.
 *
 * @see apps/mobile/src/api/hooks/useNutritionDetail.ts — data seam (API/cache/mock)
 * @see apps/mobile/src/features/nutrition/nutritionModel.ts — pure formatting helpers
 * @see UI/UX Spec §6.6 — Nutrition v1 layout + UX-NUT-001..004
 */

import React, { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { Screen, Text, useTheme } from '@primis/design-system';

import { useNutritionDetail } from '../../api/hooks/useNutritionDetail';
import { DataStatePanel } from '../../components/DataStatePanel';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  hasLifestyleData,
  hasMacroData,
  isNutritionDayEmpty,
  resolveNutritionBanner,
} from './nutritionModel';
import {
  BehaviorInputsCard,
  CorrelationsCard,
  MacroProgressCard,
  MealTimingCard,
  NutritionBanner,
  NutritionEmptyState,
  NutritionHero,
  QuickAddRow,
} from './components';

export function NutritionScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const { getTimingConfig } = useReducedMotion();
  const {
    nutrition,
    lifestyle,
    tags,
    localDate,
    timezone,
    status,
    isRefreshing,
    hasRefreshError,
    refetch,
  } = useNutritionDetail();

  // Subtle mount fade — token-driven duration, instant under reduced motion.
  const [fade] = useState(() => new Animated.Value(0));
  const fadeDuration = getTimingConfig('standard').duration;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: fadeDuration,
      useNativeDriver: true,
    }).start();
  }, [fade, fadeDuration]);

  if (nutrition === null || lifestyle === null) {
    return (
      <Screen testID="screen-nutrition" contentStyle={{ paddingTop: spacing.xl }}>
        <DataStatePanel
          state={status === 'error' ? 'api_error' : 'initial_loading'}
          title={status === 'error' ? 'Couldn’t load your nutrition' : 'Loading today’s nutrition'}
          {...(status === 'error' ? { onAction: () => void refetch() } : {})}
          testID={status === 'error' ? 'nutrition-error' : 'nutrition-loading'}
        />
      </Screen>
    );
  }

  const dayEmpty = isNutritionDayEmpty(nutrition, lifestyle.summary);
  const hasAnyData = hasMacroData(nutrition.summary) || hasLifestyleData(lifestyle.summary);
  const banner = resolveNutritionBanner(nutrition.summary.localDate, localDate, hasAnyData);

  return (
    <Screen testID="screen-nutrition" contentStyle={{ paddingTop: spacing.xl }}>
      <Animated.View style={{ opacity: fade, gap: spacing.lg }}>
        <View style={{ gap: spacing.xxs }}>
          <Text variant="titleLarge">Nutrition</Text>
          <Text variant="bodySmall" color="muted">
            Today · manual logging
          </Text>
        </View>

        {isRefreshing && <DataStatusBanner state="refreshing" testID="nutrition-refreshing" />}
        {hasRefreshError && (
          <DataStatusBanner
            state="api_error"
            title="Couldn’t update nutrition"
            body="Showing your latest saved entries and totals."
            onAction={() => void refetch()}
            testID="nutrition-refresh-error"
          />
        )}

        {banner !== null && (
          <NutritionBanner
            banner={banner}
            onAction={() => void refetch()}
            testID="nutrition-banner"
          />
        )}

        <NutritionHero
          macro={nutrition.summary}
          lifestyle={lifestyle.summary}
          testID="nutrition-hero"
        />

        <QuickAddRow testID="nutrition-quick-add-row" />

        {dayEmpty ? (
          <NutritionEmptyState testID="nutrition-empty" />
        ) : (
          <>
            <MacroProgressCard
              summary={nutrition.summary}
              entries={nutrition.entries}
              testID="nutrition-macros"
            />
            <BehaviorInputsCard
              lifestyle={lifestyle.summary}
              timezone={timezone}
              tags={tags}
              testID="nutrition-behavior"
            />
            <MealTimingCard
              entries={nutrition.entries}
              timezone={timezone}
              testID="nutrition-meals"
            />
          </>
        )}

        <CorrelationsCard testID="nutrition-correlations" />
      </Animated.View>
    </Screen>
  );
}
