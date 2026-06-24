/**
 * @primis/mobile — connections feature public surface (CU-060).
 *
 * The route file under `app/settings/` is a thin wrapper that renders
 * `ConnectionsScreen`. The controller hook and pure helpers are exported for the
 * screen, components, and tests.
 */

export { ConnectionsScreen } from './screens/ConnectionsScreen';

export { ConnectionCard } from './components/ConnectionCard';
export type { ConnectionCardProps } from './components/ConnectionCard';
export { CapabilityList } from './components/CapabilityList';
export type { CapabilityListProps } from './components/CapabilityList';

export { useConnections } from './useConnections';
export type {
  ConnectionsController,
  ConnectionsLoadStatus,
  ConnectionsPendingAction,
} from './useConnections';

export {
  deriveConnectionUiState,
  getConnectionStateCopy,
  formatSyncFreshness,
  toCapabilityViews,
  metricDisplayName,
  canRefresh,
  STALE_AFTER_HOURS,
  HEALTH_PERMISSION_NOTES,
  UNVERIFIED_AVAILABILITY_NOTE,
} from './connectionState';
export type {
  ConnectionUiState,
  ConnectionStateInput,
  ConnectionStateCopy,
  ConnectionAction,
  CapabilityView,
} from './connectionState';
