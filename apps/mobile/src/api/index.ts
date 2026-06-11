/**
 * Public API surface for the mobile API layer.
 *
 * Import from `@/api` (or the relative path) rather than from individual
 * files to keep call sites stable if internal structure changes.
 *
 * @example
 * ```ts
 * import { apiClient, API_ENDPOINTS, ApiClientError, MockModeError } from '@/api';
 * ```
 */

export { apiClient, PrimisApiClient } from './client';
export type { ApiClientConfig } from './client';

export { API_ENDPOINTS } from './endpoints';
export type { ApiEndpointKey, ApiEndpointPath } from './endpoints';

export { ApiClientError, MockModeError, parseApiError } from './errors';
