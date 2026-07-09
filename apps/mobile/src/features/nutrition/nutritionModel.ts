/**
 * nutritionModel — pure, render-free helpers for the Nutrition tab (CU-075).
 *
 * Everything here is deterministic and free of React / React Native imports so it
 * runs in the node Vitest env. The Nutrition screen and its components import these
 * helpers to FORMAT the precomputed `NutritionDayResponseDto` (macros) and
 * `LifestyleDayResponseDto` (hydration/caffeine/alcohol) — no scoring, no targets,
 * no fabricated goals, and no heavy transforms on the render path (ADR-006 / ADR-008).
 *
 * Honesty rules (UX-NUT-003, Phase H §7):
 *   - Manual macros are user estimates — surfaced via {@link isManualEstimate}, never
 *     presented as exact.
 *   - Missing values render as an em dash and are flagged `isMissing` — we never
 *     fabricate a zero (an unlogged day is empty, not "0 g").
 *   - There are no macro/calorie/hydration TARGETS in Phase H, so "macro progress"
 *     is an honest energy SPLIT (share of calories per macronutrient), not a goal bar.
 *
 * @see apps/mobile/src/api/hooks/useNutritionDetail.ts — data seam (API/cache/mock)
 * @see apps/mobile/src/features/quickAdd/quickAddModel.ts — shared lifestyle formatters
 * @see UI/UX Spec §6.6 — Nutrition v1 layout + UX-NUT-001..004
 */

import type {
  CustomTagDto,
  LifestyleDailySummaryDto,
  NutritionDailySummaryDto,
  NutritionDayResponseDto,
  NutritionEntryDto,
} from '@primis/api-contracts';

// Re-export the shared lifestyle formatters so the screen has one import surface.
export { formatHydration, formatCaffeine, formatDrinks } from '../quickAdd/quickAddModel';

const EM_DASH = '—';

/** Atwater energy factors (kcal per gram) — for the honest macro energy split. */
const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

// ── Number / unit formatting ────────────────────────────────────────────────────

/** Group a non-negative number with thousands separators (locale-independent). */
function formatThousands(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format an energy total in kilocalories; null/absent → em dash (never a zero). */
export function formatCalories(kcal: number | null): string {
  if (kcal === null) return EM_DASH;
  return formatThousands(kcal);
}

/** Format a macronutrient mass in grams; null/absent → em dash. */
export function formatMacroGrams(grams: number | null): string {
  if (grams === null) return EM_DASH;
  return `${Math.round(grams)} g`;
}

/**
 * Format an ISO 8601 UTC instant as a local "h:mm AM/PM" time in the given IANA
 * zone. Returns em dash when the instant is null or cannot be parsed. Pure and
 * node-safe (uses Intl, no Date-locale ambiguity).
 */
export function formatLocalTime(iso: string | null, timezone: string): string {
  if (iso === null) return EM_DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return EM_DASH;
  }
}

// ── Manual-estimate labeling (UX-NUT-003) ────────────────────────────────────────

/**
 * True when an entry should be labeled a manual/AI estimate rather than a precise
 * measurement. In Phase H every entry is `manual_macros` typed by the user, so this
 * is effectively always true — but we derive it from the contract flags so the
 * labeling stays correct once food-database / AI estimate methods arrive.
 */
export function isManualEstimate(entry: NutritionEntryDto): boolean {
  return (
    entry.aiEstimated ||
    entry.entryMethod === 'manual_macros' ||
    entry.dataQuality === 'estimated' ||
    entry.dataQuality === 'low_confidence'
  );
}

/** True when ANY entry in the day is a manual/AI estimate (drives the day-level badge). */
export function dayHasManualEstimates(entries: readonly NutritionEntryDto[]): boolean {
  return entries.some(isManualEstimate);
}

// ── Data presence / empty state ──────────────────────────────────────────────────

/** True when the macro summary carries at least one logged value. */
export function hasMacroData(summary: NutritionDailySummaryDto): boolean {
  return (
    summary.caloriesInKcal !== null ||
    summary.proteinG !== null ||
    summary.carbsG !== null ||
    summary.fatG !== null ||
    summary.fiberG !== null
  );
}

/** True when the lifestyle summary carries at least one logged value. */
export function hasLifestyleData(summary: LifestyleDailySummaryDto): boolean {
  return (
    summary.hydrationMl !== null ||
    summary.caffeineMg !== null ||
    summary.alcoholStandardDrinks !== null
  );
}

/** True when nothing at all has been logged for the day (drives the empty state). */
export function isNutritionDayEmpty(
  nutrition: NutritionDayResponseDto,
  lifestyle: LifestyleDailySummaryDto,
): boolean {
  return (
    !hasMacroData(nutrition.summary) &&
    !hasLifestyleData(lifestyle) &&
    nutrition.entries.length === 0
  );
}

// ── Freshness / stale banner ──────────────────────────────────────────────────────

export interface NutritionBannerVm {
  readonly tone: 'stale';
  readonly message: string;
}

/**
 * Derive a calm, non-blocking "stale" banner when the day on screen is behind the
 * user's current local date but still carries logged data — e.g. they have not
 * logged anything today yet, so the latest summary is yesterday's. Returns null
 * when the data is current or there is nothing to be stale about. Never alarms.
 */
export function resolveNutritionBanner(
  summaryLocalDate: string,
  todayLocalDate: string,
  hasData: boolean,
): NutritionBannerVm | null {
  if (!hasData) return null;
  if (summaryLocalDate >= todayLocalDate) return null;
  return {
    tone: 'stale',
    message: 'Showing your most recent logged day — nothing is logged for today yet.',
  };
}

// ── Hero (calories / protein / hydration state) ──────────────────────────────────

export interface NutritionHeroVm {
  readonly caloriesText: string;
  readonly caloriesMissing: boolean;
  readonly proteinText: string;
  readonly proteinMissing: boolean;
  readonly hydrationText: string;
  readonly hydrationMissing: boolean;
  readonly accessibilityLabel: string;
}

/** Build the hero view-model: calories, protein, and hydration state for the day. */
export function buildNutritionHero(
  macro: NutritionDailySummaryDto,
  lifestyle: LifestyleDailySummaryDto,
  formatHydrationFn: (ml: number | null) => string,
): NutritionHeroVm {
  const caloriesMissing = macro.caloriesInKcal === null;
  const proteinMissing = macro.proteinG === null;
  const hydrationMissing = lifestyle.hydrationMl === null || lifestyle.hydrationMl === 0;

  const caloriesText = formatCalories(macro.caloriesInKcal);
  const proteinText = formatMacroGrams(macro.proteinG);
  const hydrationText = formatHydrationFn(lifestyle.hydrationMl);

  return {
    caloriesText,
    caloriesMissing,
    proteinText,
    proteinMissing,
    hydrationText,
    hydrationMissing,
    accessibilityLabel:
      `Today so far: ${caloriesMissing ? 'no calories logged' : `${caloriesText} calories`}, ` +
      `${proteinMissing ? 'no protein logged' : `${proteinText} protein`}, ` +
      `${hydrationMissing ? 'no water logged' : `${hydrationText} water`}.`,
  };
}

// ── Macro split (honest, target-free "progress") ──────────────────────────────────

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat';

export interface MacroRow {
  readonly key: MacroKey;
  readonly label: string;
  /** Preformatted display value (unit-suffixed), or em dash when absent. */
  readonly valueText: string;
  readonly isMissing: boolean;
  /**
   * Share of the day's macro-derived calories this macro contributes, 0–100.
   * Null for the `calories` row (it is the total, not a slice) and whenever no
   * macro grams have been logged. This is an energy SPLIT, never a goal.
   */
  readonly sharePct: number | null;
  readonly accessibilityLabel: string;
}

/**
 * Build the macro rows (calories, protein, carbs, fat) with an honest energy split.
 * The split is each macro's share of total macro-derived calories (protein/carbs at
 * 4 kcal/g, fat at 9 kcal/g) — NOT progress toward a target (none exist in Phase H).
 * Missing macros show an em dash and a null share; we never fabricate a zero.
 */
export function buildMacroRows(summary: NutritionDailySummaryDto): MacroRow[] {
  const proteinKcal = (summary.proteinG ?? 0) * KCAL_PER_GRAM.protein;
  const carbsKcal = (summary.carbsG ?? 0) * KCAL_PER_GRAM.carbs;
  const fatKcal = (summary.fatG ?? 0) * KCAL_PER_GRAM.fat;
  const macroKcalTotal = proteinKcal + carbsKcal + fatKcal;

  const share = (kcal: number, present: boolean): number | null => {
    if (!present || macroKcalTotal === 0) return null;
    return Math.round((kcal / macroKcalTotal) * 100);
  };

  const rows: MacroRow[] = [
    {
      key: 'calories',
      label: 'Calories',
      valueText: summary.caloriesInKcal === null ? EM_DASH : formatCalories(summary.caloriesInKcal),
      isMissing: summary.caloriesInKcal === null,
      sharePct: null,
      accessibilityLabel:
        summary.caloriesInKcal === null
          ? 'Calories: not logged.'
          : `Calories: ${formatCalories(summary.caloriesInKcal)} kilocalories.`,
    },
    macroRow('protein', 'Protein', summary.proteinG, share(proteinKcal, summary.proteinG !== null)),
    macroRow('carbs', 'Carbs', summary.carbsG, share(carbsKcal, summary.carbsG !== null)),
    macroRow('fat', 'Fat', summary.fatG, share(fatKcal, summary.fatG !== null)),
  ];

  return rows;
}

function macroRow(
  key: MacroKey,
  label: string,
  grams: number | null,
  sharePct: number | null,
): MacroRow {
  const isMissing = grams === null;
  const valueText = formatMacroGrams(grams);
  return {
    key,
    label,
    valueText,
    isMissing,
    sharePct,
    accessibilityLabel: isMissing
      ? `${label}: not logged.`
      : `${label}: ${valueText}${sharePct !== null ? `, ${sharePct} percent of macro calories` : ''}.`,
  };
}

// ── Behavior inputs (caffeine / alcohol / tags) ──────────────────────────────────

export interface BehaviorInputRow {
  readonly key: string;
  readonly label: string;
  readonly valueText: string;
  /** Optional secondary line, e.g. caffeine's latest-time or an alcohol type. */
  readonly detailText: string | null;
  readonly isMissing: boolean;
  readonly accessibilityLabel: string;
}

/**
 * Build the behavior-input rows (caffeine + latest time, alcohol amount). Hydration
 * lives in the hero; meal timing has its own list. Copy is factual and never
 * moralizing (Phase H §7). Missing inputs read muted, never a fake zero.
 */
export function buildBehaviorRows(
  lifestyle: LifestyleDailySummaryDto,
  timezone: string,
  fmt: {
    formatCaffeine: (mg: number | null) => string;
    formatDrinks: (drinks: number | null) => string;
  },
): BehaviorInputRow[] {
  const caffeineMissing = lifestyle.caffeineMg === null || lifestyle.caffeineMg === 0;
  const caffeineText = fmt.formatCaffeine(lifestyle.caffeineMg);
  const latestTime =
    lifestyle.latestCaffeineTimeUtc === null
      ? null
      : formatLocalTime(lifestyle.latestCaffeineTimeUtc, timezone);

  const alcoholMissing = lifestyle.alcoholStandardDrinks === null;
  const alcoholText = fmt.formatDrinks(lifestyle.alcoholStandardDrinks);

  return [
    {
      key: 'caffeine',
      label: 'Caffeine',
      valueText: caffeineText,
      detailText: latestTime !== null ? `Latest at ${latestTime}` : null,
      isMissing: caffeineMissing,
      accessibilityLabel: caffeineMissing
        ? 'Caffeine: none logged.'
        : `Caffeine: ${caffeineText}${latestTime !== null ? `, latest at ${latestTime}` : ''}.`,
    },
    {
      key: 'alcohol',
      label: 'Alcohol',
      valueText: alcoholText,
      detailText: null,
      isMissing: alcoholMissing,
      accessibilityLabel: alcoholMissing ? 'Alcohol: none logged.' : `Alcohol: ${alcoholText}.`,
    },
  ];
}

// ── Meal timing ───────────────────────────────────────────────────────────────────

export interface MealTimingRow {
  readonly id: string;
  /** Friendly meal label, e.g. "Lunch" or "Meal" when the type is unknown. */
  readonly mealLabel: string;
  /** Local time of the entry, e.g. "1:30 PM". */
  readonly timeText: string;
  /** Calorie chip text when present, otherwise null (omit, never zero). */
  readonly caloriesText: string | null;
  readonly isEstimate: boolean;
  readonly accessibilityLabel: string;
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  preworkout: 'Pre-workout',
  postworkout: 'Post-workout',
  unknown: 'Meal',
};

/** Friendly label for a meal-type code; falls back to "Meal". */
export function resolveMealLabel(mealType: string | null): string {
  if (mealType === null) return 'Meal';
  return MEAL_LABELS[mealType] ?? 'Meal';
}

/**
 * Map the day's nutrition entries into meal-timing rows, newest first. Each row
 * shows when the meal was logged (local time) and its calories when present. Pure
 * formatting over the precomputed entries — no aggregation beyond ordering.
 */
export function buildMealTimingRows(
  entries: readonly NutritionEntryDto[],
  timezone: string,
): MealTimingRow[] {
  return [...entries]
    .sort((a, b) => b.occurredAtUtc.localeCompare(a.occurredAtUtc))
    .map((entry) => {
      const mealLabel = resolveMealLabel(entry.mealType);
      const timeText = formatLocalTime(entry.occurredAtUtc, timezone);
      const caloriesText =
        entry.totalCaloriesKcal === null ? null : `${formatCalories(entry.totalCaloriesKcal)} kcal`;
      const isEstimate = isManualEstimate(entry);
      return {
        id: entry.id,
        mealLabel,
        timeText,
        caloriesText,
        isEstimate,
        accessibilityLabel:
          `${mealLabel} at ${timeText}` +
          `${caloriesText !== null ? `, ${caloriesText}` : ''}` +
          `${isEstimate ? ', manual estimate' : ''}.`,
      };
    });
}

// ── Custom tags ───────────────────────────────────────────────────────────────────

export interface TagChipVm {
  readonly key: string;
  readonly label: string;
}

/** Map the user's active custom tags into display chips (UX-INPUT-004). */
export function buildTagChips(tags: readonly CustomTagDto[]): TagChipVm[] {
  return tags.filter((t) => t.isActive).map((t) => ({ key: t.tagCode, label: t.displayName }));
}
