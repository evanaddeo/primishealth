/**
 * Pure daily aggregation for manually logged lifestyle inputs (ADR-008).
 *
 * This is the single, canonical, deterministic aggregation function for the
 * lifestyle fields of `daily_nutrition_summaries`. It is intentionally pure —
 * **no database access** — so the API write-through (CU-070) and a future worker
 * reconcile pass can call the identical math without drift.
 *
 * It computes ONLY simple sums and latest-times. It never computes
 * `nutrition_score`, targets, or macros — those stay Phase-F / CU-072 owned.
 * `null` is returned for a domain with no entries so callers never clobber a
 * real value (or another writer's field) with a spurious `0`.
 *
 * @see docs/decisions/ADR-008-manual-input-daily-aggregation-and-freshness.md
 * @see plans/phase-h-manual-inputs-nutrition-v1.md — CU-070, §5 (ADR-008)
 */

/** A hydration entry's contribution: canonical milliliters already normalized. */
export interface HydrationAggregateInput {
  /** Fluid amount in canonical milliliters. */
  readonly amountMl: number;
}

/** A caffeine entry's contribution: milligrams (optional) + when it occurred. */
export interface CaffeineAggregateInput {
  /** Caffeine in milligrams; `null` when the user logged a drink without a dose. */
  readonly caffeineMg: number | null;
  /** Instant the caffeine was consumed (UTC ISO 8601 string). */
  readonly occurredAtUtc: string;
}

/** An alcohol entry's contribution: standard drinks. */
export interface AlcoholAggregateInput {
  /** Standard drinks for this entry. */
  readonly standardDrinks: number;
}

/** All of one `(user_id, local_date)` day's lifestyle entries. */
export interface LifestyleDayInputs {
  readonly hydration: readonly HydrationAggregateInput[];
  readonly caffeine: readonly CaffeineAggregateInput[];
  readonly alcohol: readonly AlcoholAggregateInput[];
}

/**
 * The lifestyle subset of `daily_nutrition_summaries` this function owns.
 *
 * Each field is `null` when the corresponding domain has no entries for the day,
 * so a write-through upsert can leave it untouched rather than zeroing it.
 */
export interface LifestyleDailyAggregate {
  /** Sum of fluid intake in milliliters, or `null` when nothing was logged. */
  readonly hydrationMl: number | null;
  /** Sum of caffeine in milligrams, or `null` when nothing was logged. */
  readonly caffeineMg: number | null;
  /** Latest caffeine timestamp of the day (UTC ISO 8601), or `null`. */
  readonly latestCaffeineTimeUtc: string | null;
  /** Sum of standard drinks, or `null` when nothing was logged. */
  readonly alcoholStandardDrinks: number | null;
}

/**
 * Aggregates a single day's manual lifestyle entries into the summary fields it
 * owns. Pure and deterministic: the same inputs always produce the same output,
 * which is what makes the write-through upsert idempotent (ADR-008 §4).
 *
 * - `hydrationMl`: sum of `amountMl`; `null` if there are no hydration entries.
 * - `caffeineMg`: sum of `caffeineMg` (treating a dose-less entry as `0`);
 *   `null` if there are no caffeine entries.
 * - `latestCaffeineTimeUtc`: the maximum `occurredAtUtc` across caffeine entries;
 *   `null` if there are none.
 * - `alcoholStandardDrinks`: sum of `standardDrinks`; `null` if there are none.
 *
 * @param inputs - The day's hydration / caffeine / alcohol entries.
 * @returns The owned lifestyle summary fields.
 */
export function aggregateLifestyleDay(inputs: LifestyleDayInputs): LifestyleDailyAggregate {
  const { hydration, caffeine, alcohol } = inputs;

  const hydrationMl =
    hydration.length > 0 ? hydration.reduce((sum, e) => sum + e.amountMl, 0) : null;

  const caffeineMg =
    caffeine.length > 0 ? caffeine.reduce((sum, e) => sum + (e.caffeineMg ?? 0), 0) : null;

  let latestCaffeineTimeUtc: string | null = null;
  let latestMs = -Infinity;
  for (const e of caffeine) {
    const ms = Date.parse(e.occurredAtUtc);
    if (ms > latestMs) {
      latestMs = ms;
      latestCaffeineTimeUtc = e.occurredAtUtc;
    }
  }

  const alcoholStandardDrinks =
    alcohol.length > 0 ? alcohol.reduce((sum, e) => sum + e.standardDrinks, 0) : null;

  return { hydrationMl, caffeineMg, latestCaffeineTimeUtc, alcoholStandardDrinks };
}

// ---------------------------------------------------------------------------
// Manual macro nutrition (CU-072)
// ---------------------------------------------------------------------------

/**
 * One nutrition entry's contribution to the day's macro totals. Each macro is
 * already in its canonical unit (kcal / grams) and may be `null` when the user
 * left a field blank on a manual estimate.
 */
export interface MacroAggregateInput {
  /** Energy in canonical kilocalories, or `null` when not logged. */
  readonly caloriesKcal: number | null;
  /** Protein in canonical grams, or `null` when not logged. */
  readonly proteinG: number | null;
  /** Carbohydrate in canonical grams, or `null` when not logged. */
  readonly carbsG: number | null;
  /** Fat in canonical grams, or `null` when not logged. */
  readonly fatG: number | null;
  /** Fiber in canonical grams, or `null` when not logged. */
  readonly fiberG: number | null;
}

/**
 * The macro subset of `daily_nutrition_summaries` this function owns.
 *
 * Each field is `null` when there are no nutrition entries for the day, so a
 * write-through upsert can leave it untouched rather than zeroing it. (When
 * entries exist, a blank field contributes `0` to the sum.)
 */
export interface MacroDailyAggregate {
  /** Sum of energy in kilocalories, or `null` when nothing was logged. */
  readonly caloriesKcal: number | null;
  /** Sum of protein in grams, or `null` when nothing was logged. */
  readonly proteinG: number | null;
  /** Sum of carbohydrate in grams, or `null` when nothing was logged. */
  readonly carbsG: number | null;
  /** Sum of fat in grams, or `null` when nothing was logged. */
  readonly fatG: number | null;
  /** Sum of fiber in grams, or `null` when nothing was logged. */
  readonly fiberG: number | null;
}

/**
 * Aggregates a single day's manual nutrition entries into the macro/calorie
 * summary fields it owns. Pure and deterministic (ADR-008 §2): the same inputs
 * always produce the same output, which keeps the write-through upsert
 * idempotent.
 *
 * Each field is the simple sum of that macro across the day's entries (a blank
 * field counts as `0`), or `null` when there are no entries at all so the
 * write-through never clobbers a real value with a spurious `0`. It computes
 * ONLY sums — never `nutrition_score`, targets, `calories_out`, or
 * `calorie_balance` (those stay Phase-F / provider owned).
 *
 * @param entries - The day's nutrition entries' macro contributions.
 * @returns The owned macro/calorie summary fields.
 */
export function aggregateMacroDay(entries: readonly MacroAggregateInput[]): MacroDailyAggregate {
  if (entries.length === 0) {
    return { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null };
  }

  const sumOf = (pick: (e: MacroAggregateInput) => number | null): number =>
    entries.reduce((sum, e) => sum + (pick(e) ?? 0), 0);

  return {
    caloriesKcal: sumOf((e) => e.caloriesKcal),
    proteinG: sumOf((e) => e.proteinG),
    carbsG: sumOf((e) => e.carbsG),
    fatG: sumOf((e) => e.fatG),
    fiberG: sumOf((e) => e.fiberG),
  };
}
