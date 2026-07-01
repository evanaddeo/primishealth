/**
 * NutritionContextBuilder (CU-080) — spec §10.7, §13.7 (AI-SAFE-007).
 *
 * Assembles a compact nutrition picture for a day: macro totals, meal timing,
 * hydration / caffeine / alcohol, the user's nutrition philosophy, and a bounded
 * set of food entries — each tagged with its provenance. It explicitly flags
 * AI-estimated food as an estimate so the model never presents an approximation as
 * an exact figure (§13.7). It does NOT moralize food or produce medical nutrition
 * therapy.
 *
 * TODO(phase-h): the underlying nutrition/manual data-population paths (routes,
 * FoodData Central, populated tables) land with Phase H. Until Phase H is merged
 * into this branch this builder is exercised against the Phase-D repos + fixtures
 * via its port and MUST NOT be wired into a live flow (CU-082/083 confirm data).
 */

import type { AiConfidence, AiEvidence, NutritionPhilosophyContext } from '@primis/api-contracts';

import { assertNoRawContent } from '../AiContextPacket.js';
import type { ContextBuilder, ContextBuilderInput, ContextBuilderResult } from '../contextTypes.js';

import { maxConfidence, round } from './builderUtils.js';
import type { BuilderClockOptions } from './types.js';

const DOMAIN = 'nutrition' as const;

/** Max food entries surfaced (keeps packets compact — never a full food log). */
const MAX_FOOD_ENTRIES = 12;

// ---------------------------------------------------------------------------
// Read models + port
// ---------------------------------------------------------------------------

/** Provenance of a logged food item — drives estimate flagging (§10.7). */
export type FoodEntrySource =
  | 'user_entered_exact'
  | 'food_data_central'
  | 'ai_estimated'
  | 'manual_macro_total';

/** A normalized food entry (never a raw provider/import blob). */
export interface FoodEntryReadModel {
  entryId: string;
  label: string;
  source: FoodEntrySource;
  caloriesKcal?: number | null;
  proteinG?: number | null;
  mealLocalTime?: string;
  /** 0..1 confidence for AI-estimated entries. */
  estimateConfidence?: number | null;
}

/** Normalized nutrition context the {@link NutritionDataPort} returns. */
export interface NutritionReadModel {
  localDate: string;
  macros?: {
    caloriesKcal?: number | null;
    proteinG?: number | null;
    carbsG?: number | null;
    fatG?: number | null;
  };
  entries: FoodEntryReadModel[];
  mealTiming?: {
    firstMealLocal?: string;
    lastMealLocal?: string;
    mealCount?: number | null;
  };
  hydrationMl?: number | null;
  hydrationGoalMl?: number | null;
  caffeineMg?: number | null;
  alcoholUnits?: number | null;
  /** User's nutrition philosophy (usually sourced from the profile builder). */
  nutritionPhilosophy?: NutritionPhilosophyContext;
}

/** Options narrowing a nutrition query. */
export interface NutritionQueryOptions {
  asOfLocalDate?: string;
}

/** Read-only port supplying the day's nutrition context. */
export interface NutritionDataPort {
  getNutritionContext(
    userId: string,
    options: NutritionQueryOptions,
  ): Promise<NutritionReadModel | undefined>;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

/** Overall provenance of the day's macro totals. */
export type MacroProvenance =
  | 'exact'
  | 'mixed_with_estimates'
  | 'estimated'
  | 'manual_total'
  | 'unknown';

export interface FoodEntrySummary {
  entryId: string;
  label: string;
  source: FoodEntrySource;
  caloriesKcal: number | null;
  isEstimate: boolean;
}

/** Compact payload produced by {@link NutritionContextBuilder}. */
export interface NutritionContextPayload {
  localDate: string;
  medicalNutritionTherapy: false;
  macros: {
    caloriesKcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  };
  macroProvenance: MacroProvenance;
  containsEstimate: boolean;
  entrySourceCounts: Record<FoodEntrySource, number>;
  foodEntries: FoodEntrySummary[];
  mealTiming: { firstMealLocal?: string; lastMealLocal?: string; mealCount: number | null } | null;
  hydration: { totalMl: number | null; goalMl: number | null } | null;
  caffeineMg: number | null;
  alcoholUnits: number | null;
  nutritionPhilosophy?: NutritionPhilosophyContext;
  caveats: string[];
}

export class NutritionContextBuilder implements ContextBuilder<NutritionContextPayload> {
  readonly domain = DOMAIN;

  constructor(
    private readonly port: NutritionDataPort,
    private readonly options: BuilderClockOptions = {},
  ) {}

  async build(input: ContextBuilderInput): Promise<ContextBuilderResult<NutritionContextPayload>> {
    void this.options;
    const asOfLocalDate = input.timeRange.endDate ?? input.timeRange.startDate;
    const query: NutritionQueryOptions = {};
    if (asOfLocalDate) query.asOfLocalDate = asOfLocalDate;
    const model = await this.port.getNutritionContext(input.userId, query);

    const evidence: AiEvidence[] = [];
    const limitations: string[] = [];
    const caveats: string[] = ['Nutrition guidance is not medical nutrition therapy.'];

    if (!model) {
      const payload: NutritionContextPayload = {
        localDate: asOfLocalDate ?? 'latest',
        medicalNutritionTherapy: false,
        macros: { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null },
        macroProvenance: 'unknown',
        containsEstimate: false,
        entrySourceCounts: this.zeroCounts(),
        foodEntries: [],
        mealTiming: null,
        hydration: null,
        caffeineMg: null,
        alcoholUnits: null,
        caveats,
      };
      assertNoRawContent(payload);
      return {
        domain: this.domain,
        payload,
        evidence: [],
        limitations: ['No nutrition data logged for the requested day.'],
        completeness: 0,
        confidence: 'not_enough_data',
      };
    }

    // --- Entries + provenance ------------------------------------------------
    const entries = model.entries.slice(0, MAX_FOOD_ENTRIES).map((e) => this.summarizeEntry(e));
    const entrySourceCounts = this.countSources(model.entries);
    const containsEstimate = model.entries.some((e) => e.source === 'ai_estimated');
    const macroProvenance = this.deriveProvenance(model.entries);
    if (containsEstimate) {
      caveats.push('Some food entries are AI-estimated — treat macro totals as approximate.');
    }
    if (model.entries.length > MAX_FOOD_ENTRIES) {
      limitations.push(
        `Showing ${MAX_FOOD_ENTRIES} of ${model.entries.length} food entries (bounded for the prompt).`,
      );
    }

    // --- Macros --------------------------------------------------------------
    const macros = {
      caloriesKcal: round(model.macros?.caloriesKcal, 0),
      proteinG: round(model.macros?.proteinG, 0),
      carbsG: round(model.macros?.carbsG, 0),
      fatG: round(model.macros?.fatG, 0),
    };
    const hasMacros = Object.values(macros).some((v) => v !== null);
    if (hasMacros) {
      evidence.push({
        id: 'ev_nutrition_macros',
        type: 'nutrition_summary',
        domain: DOMAIN,
        statement: `Logged intake: ${macros.caloriesKcal ?? '?'} kcal, ${
          macros.proteinG ?? '?'
        }g protein, ${macros.carbsG ?? '?'}g carbs, ${macros.fatG ?? '?'}g fat${
          containsEstimate ? ' (includes AI-estimated items)' : ''
        }.`,
        confidence: containsEstimate ? 'low' : 'medium',
        source: containsEstimate ? 'ai_prior_summary' : 'manual_input',
        rangeStart: model.localDate,
        rangeEnd: model.localDate,
        ...(macros.caloriesKcal !== null ? { value: macros.caloriesKcal, unit: 'kcal' } : {}),
      });
    } else {
      limitations.push('No macro totals available for the day.');
    }

    // --- Hydration / caffeine / alcohol -------------------------------------
    this.pushManualEvidence(
      evidence,
      model,
      'hydration',
      'water_intake_ml',
      model.hydrationMl,
      'ml',
      (v) =>
        `Hydration logged: ${v} ml${model.hydrationGoalMl ? ` (goal ${model.hydrationGoalMl} ml)` : ''}.`,
    );
    this.pushManualEvidence(
      evidence,
      model,
      'caffeine',
      'caffeine_mg',
      model.caffeineMg,
      'mg',
      (v) => `Caffeine logged: ${v} mg.`,
    );
    this.pushManualEvidence(
      evidence,
      model,
      'alcohol',
      'alcohol_units',
      model.alcoholUnits,
      'units',
      (v) => `Alcohol logged: ${v} unit(s).`,
    );

    const payload: NutritionContextPayload = {
      localDate: model.localDate,
      medicalNutritionTherapy: false,
      macros,
      macroProvenance,
      containsEstimate,
      entrySourceCounts,
      foodEntries: entries,
      mealTiming: model.mealTiming
        ? {
            mealCount: round(model.mealTiming.mealCount, 0),
            ...(model.mealTiming.firstMealLocal
              ? { firstMealLocal: model.mealTiming.firstMealLocal }
              : {}),
            ...(model.mealTiming.lastMealLocal
              ? { lastMealLocal: model.mealTiming.lastMealLocal }
              : {}),
          }
        : null,
      hydration:
        model.hydrationMl != null || model.hydrationGoalMl != null
          ? { totalMl: round(model.hydrationMl, 0), goalMl: round(model.hydrationGoalMl, 0) }
          : null,
      caffeineMg: round(model.caffeineMg, 0),
      alcoholUnits: round(model.alcoholUnits, 1),
      caveats,
      ...(model.nutritionPhilosophy ? { nutritionPhilosophy: model.nutritionPhilosophy } : {}),
    };
    assertNoRawContent(payload);

    return {
      domain: this.domain,
      payload,
      evidence,
      limitations,
      completeness: this.completeness(hasMacros, entries.length, model),
      confidence: this.aggregateConfidence(evidence),
    };
  }

  private summarizeEntry(e: FoodEntryReadModel): FoodEntrySummary {
    return {
      entryId: e.entryId,
      label: e.label,
      source: e.source,
      caloriesKcal: round(e.caloriesKcal, 0),
      isEstimate: e.source === 'ai_estimated',
    };
  }

  private zeroCounts(): Record<FoodEntrySource, number> {
    return {
      user_entered_exact: 0,
      food_data_central: 0,
      ai_estimated: 0,
      manual_macro_total: 0,
    };
  }

  private countSources(entries: FoodEntryReadModel[]): Record<FoodEntrySource, number> {
    const counts = this.zeroCounts();
    for (const e of entries) counts[e.source] += 1;
    return counts;
  }

  private deriveProvenance(entries: FoodEntryReadModel[]): MacroProvenance {
    if (entries.length === 0) return 'unknown';
    const sources = new Set(entries.map((e) => e.source));
    if (sources.size === 1) {
      const only = [...sources][0];
      if (only === 'ai_estimated') return 'estimated';
      if (only === 'manual_macro_total') return 'manual_total';
      return 'exact';
    }
    if (sources.has('ai_estimated')) return 'mixed_with_estimates';
    return 'exact';
  }

  private pushManualEvidence(
    evidence: AiEvidence[],
    model: NutritionReadModel,
    domain: 'hydration' | 'caffeine' | 'alcohol',
    metricCode: string,
    value: number | null | undefined,
    unit: string,
    statement: (v: number) => string,
  ): void {
    if (value === null || value === undefined) return;
    const rounded = round(value, 1) ?? value;
    evidence.push({
      id: `ev_${metricCode}`,
      type: 'manual_input',
      domain,
      statement: statement(rounded),
      metricCode,
      value: rounded,
      unit,
      confidence: 'medium',
      source: 'manual_input',
      rangeStart: model.localDate,
      rangeEnd: model.localDate,
    });
  }

  private completeness(hasMacros: boolean, entryCount: number, model: NutritionReadModel): number {
    let have = 0;
    const total = 3;
    if (hasMacros) have += 1;
    if (entryCount > 0) have += 1;
    if (model.hydrationMl != null || model.caffeineMg != null || model.alcoholUnits != null)
      have += 1;
    return Math.round((have / total) * 100) / 100;
  }

  private aggregateConfidence(evidence: AiEvidence[]): AiConfidence {
    if (evidence.length === 0) return 'not_enough_data';
    let best: AiConfidence = 'not_enough_data';
    for (const ev of evidence) best = maxConfidence(best, ev.confidence);
    return best;
  }
}
