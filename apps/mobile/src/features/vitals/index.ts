/**
 * Vitals feature public surface (CU-067).
 */

export { VitalsScreen } from './VitalsScreen';
export { VITALS_ROUTE } from './routes';
export {
  CONNECTED_SOURCE_LABEL,
  UNVERIFIED_NOTE,
  buildVitalMetricRows,
  hasVitals,
  resolveEmptyVitalsMessage,
  resolveVitalsBanner,
  resolveVitalsFreshness,
  trendHasData,
} from './vitalsModel';
export type {
  DeviationDirection,
  VitalMetricRow,
  VitalsBannerTone,
  VitalsBannerVm,
  VitalsFreshnessVm,
} from './vitalsModel';
