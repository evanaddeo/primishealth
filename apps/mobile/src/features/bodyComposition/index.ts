/**
 * Body Composition feature public surface (CU-067).
 */

export { BodyCompositionScreen } from './BodyCompositionScreen';
export { BODY_COMPOSITION_ROUTE } from './routes';
export {
  buildBodyCompMetricRows,
  hasBodyCompositionData,
  resolveBodyCompFreshness,
  resolveEmptyBodyCompMessage,
  trendHasData,
} from './bodyCompositionModel';
export type {
  BodyCompFreshnessVm,
  BodyCompMetricRow,
  BodyCompositionDetail,
  BodyCompositionMetrics,
  BodyCompositionState,
} from './bodyCompositionModel';
