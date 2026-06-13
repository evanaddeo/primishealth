/**
 * Seed script for the `metric_definitions` table.
 *
 * This file is the CLI-facing entry point used by `scripts/db-seed.ts`.
 * The actual seeding logic lives in `services/api/src/seeds/seedMetricDefinitions.ts`
 * so it is within the `@primis/api` TypeScript compilation scope.
 *
 * @see services/api/src/seeds/seedMetricDefinitions.ts — canonical implementation
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §9.1–9.2
 */

export {
  seedMetricDefinitions,
  type SeedMetricDefinitionsResult,
} from '../../services/api/src/seeds/seedMetricDefinitions.js';
