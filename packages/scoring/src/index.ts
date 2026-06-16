/**
 * @primis/scoring — pure, deterministic scoring foundation for Primis.
 *
 * CU-047 bootstraps this package with reusable primitives (clamp, weighted score,
 * baseline statistics, deviation, EMA, component-score functions). Later commit
 * units add the Sleep, Recovery, Activity, Training Readiness, and Bedtime engines
 * on top of these primitives.
 *
 * Hard boundary (Phase F guardrail §5.10): formulas only — NO database, API,
 * worker, provider, or mobile dependency. The single runtime dependency is the
 * shared enum vocabulary in @primis/core-types.
 */

export * from './primitives/index.js';
export * from './sleep/index.js';
export * from './recovery/index.js';
export * from './activity/index.js';
export * from './training/index.js';
export * from './bedtime/index.js';
