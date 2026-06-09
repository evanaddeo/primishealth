/**
 * @primis/health-metrics — canonical metric registry for the Primis monorepo.
 *
 * Exports all metric metadata, typed code arrays, and registry utilities.
 * Import from this package whenever you need to look up canonical metric codes,
 * units, aggregation strategies, or iterate over metrics by health domain.
 *
 * @example
 * ```typescript
 * import { getMetric, ACTIVITY_METRIC_CODES, METRIC_DEFINITIONS } from '@primis/health-metrics';
 *
 * const steps = getMetric('steps');
 * // { code: 'steps', displayName: 'Steps', canonicalUnit: 'count', ... }
 * ```
 */

export * from './categories.js';
export * from './registry.js';
export * from './units.js';
