/**
 * Typed API client for @primis/mobile.
 *
 * All mobile HTTP calls MUST go through this client. It ensures:
 * - `ApiSuccessResponse<T>` envelope is unwrapped to `T` before returning.
 * - Non-2xx responses are mapped to typed `ApiClientError` instances.
 * - Mock mode throws `MockModeError` so the CU-023 mock provider can intercept.
 * - Auth token injection is supported (stub returns null in Phase C; Phase D
 *   wires real Cognito tokens without changing any call sites).
 *
 * Mobile MUST NOT call provider APIs directly (OpenAI, Anthropic, Google Health,
 * AWS SageMaker, etc.). All data flows through the Primis backend only.
 *
 * @see TAD §6.1 — API boundaries and mobile/backend separation
 * @see primis_ai_context_engine_spec.md — no direct mobile model-provider calls
 * @see apps/mobile/src/api/errors.ts — ApiClientError / MockModeError
 * @see apps/mobile/src/api/endpoints.ts — API_ENDPOINTS path constants
 */

import { loadPublicEnv } from '@primis/config';

import { ApiClientError, MockModeError, parseApiError } from './errors';

// Load env at module init time (not inside a render function or hook).
// Expo's Metro bundler inlines EXPO_PUBLIC_* vars at build time; they are
// not available via dynamic process.env lookups after bundling.
// @see Phase C plan CU-022 pitfall: "EXPO_PUBLIC_* vars must be set at build time"
const _env = loadPublicEnv();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for `PrimisApiClient`.
 *
 * Instantiate once and export as a singleton (`apiClient`).
 * Override for tests by constructing a new instance with mock config.
 */
export interface ApiClientConfig {
  /** Base URL for all API requests (no trailing slash). */
  baseUrl: string;
  /**
   * When `true`, all requests throw `MockModeError` instead of hitting the
   * network. The CU-023 mock data provider catches this error and returns
   * fixture data. Set to `false` in staging and production builds.
   */
  mockMode: boolean;
  /**
   * Optional async getter for the current auth token.
   *
   * Phase C stub: always returns `null` (unauthenticated).
   * Phase D: replace with Cognito `getIdToken()` — no call-site changes needed.
   *
   * @returns The JWT bearer token, or `null` if the user is not authenticated.
   */
  getAuthToken?: () => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// PrimisApiClient
// ---------------------------------------------------------------------------

/**
 * Typed fetch wrapper for the Primis backend API.
 *
 * Generic type parameter `T` is the expected shape of the `data` field inside
 * the `ApiSuccessResponse<T>` envelope. The client unwraps the envelope and
 * returns `T` directly, so call sites do not need to access `.data`.
 *
 * @example
 * ```ts
 * const dashboard = await apiClient.get<DashboardDto>(API_ENDPOINTS.DASHBOARD);
 * ```
 */
export class PrimisApiClient {
  private readonly baseUrl: string;
  private readonly mockMode: boolean;
  private readonly getAuthToken: () => Promise<string | null>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.mockMode = config.mockMode;
    this.getAuthToken = config.getAuthToken ?? (() => Promise.resolve(null));
  }

  /**
   * Perform an authenticated GET request.
   *
   * @param path    - API path string (use `API_ENDPOINTS` constants).
   * @param options - Optional `RequestInit` overrides merged after auth headers.
   * @returns Unwrapped `data` payload of type `T`.
   * @throws {MockModeError} When `mockMode` is `true`.
   * @throws {ApiClientError} For non-2xx responses or malformed envelopes.
   */
  async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this._request<T>('GET', path, undefined, options);
  }

  /**
   * Perform an authenticated POST request.
   *
   * @param path    - API path string (use `API_ENDPOINTS` constants).
   * @param body    - Request body; will be JSON-serialized.
   * @param options - Optional `RequestInit` overrides merged after auth headers.
   * @returns Unwrapped `data` payload of type `T`.
   * @throws {MockModeError} When `mockMode` is `true`.
   * @throws {ApiClientError} For non-2xx responses or malformed envelopes.
   */
  async post<T>(path: string, body: unknown, options?: RequestInit): Promise<T> {
    return this._request<T>('POST', path, body, options);
  }

  /**
   * Perform an authenticated PATCH request.
   *
   * @param path    - API path string.
   * @param body    - Partial request body; will be JSON-serialized.
   * @param options - Optional `RequestInit` overrides.
   * @returns Unwrapped `data` payload of type `T`.
   * @throws {MockModeError} When `mockMode` is `true`.
   * @throws {ApiClientError} For non-2xx responses or malformed envelopes.
   */
  async patch<T>(path: string, body: unknown, options?: RequestInit): Promise<T> {
    return this._request<T>('PATCH', path, body, options);
  }

  /**
   * Perform an authenticated DELETE request.
   *
   * @param path    - API path string.
   * @param options - Optional `RequestInit` overrides.
   * @returns Unwrapped `data` payload of type `T`.
   * @throws {MockModeError} When `mockMode` is `true`.
   * @throws {ApiClientError} For non-2xx responses or malformed envelopes.
   */
  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this._request<T>('DELETE', path, undefined, options);
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async _request<T>(
    method: string,
    path: string,
    body: unknown,
    options?: RequestInit,
  ): Promise<T> {
    if (this.mockMode) {
      throw new MockModeError(path);
    }

    const token = await this.getAuthToken();

    // HeadersInit is a DOM type unavailable in React Native; use Record<string, string>.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Auth header injected when a token is available; omitted otherwise.
      // Phase D replaces the null stub with a real Cognito token.
      ...(token !== null && { Authorization: `Bearer ${token}` }),
      // Caller-supplied headers applied last so they can override defaults.
      ...(options?.headers as Record<string, string> | undefined),
    };

    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      let errorBody: unknown = null;
      try {
        errorBody = await response.json();
      } catch {
        // Body is not JSON (e.g. HTML error page from a gateway) — parseApiError handles null.
      }
      throw parseApiError(response.status, errorBody);
    }

    const json: unknown = await response.json();

    if (!isSuccessEnvelope(json)) {
      // 2xx response without a valid ApiSuccessResponse envelope.
      // Likely a misconfigured proxy or a backend regression.
      throw new ApiClientError(
        'INTERNAL_ERROR',
        'API response did not match the expected success envelope shape',
        response.status,
      );
    }

    return json.data as T;
  }
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Narrow `unknown` to `{ success: true; data: unknown }` for safe envelope access.
 * Does not validate the `data` payload shape — that is the caller's responsibility.
 */
function isSuccessEnvelope(value: unknown): value is { success: true; data: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)['success'] === true &&
    'data' in value
  );
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * Singleton `PrimisApiClient` configured from public environment variables.
 *
 * Imported and used directly by hooks and TanStack Query fetchers:
 * ```ts
 * import { apiClient } from '@/api';
 * const data = await apiClient.get<DashboardDto>(API_ENDPOINTS.DASHBOARD);
 * ```
 *
 * `mockMode` is `true` by default (EXPO_PUBLIC_MOCK_MODE defaults to 'true')
 * so local development never requires a running backend. Set
 * `EXPO_PUBLIC_MOCK_MODE=false` in staging/production build pipelines.
 *
 * Phase D: supply `getAuthToken` from the Cognito auth module here.
 */
export const apiClient = new PrimisApiClient({
  baseUrl: _env.EXPO_PUBLIC_API_BASE_URL,
  mockMode: _env.EXPO_PUBLIC_MOCK_MODE === 'true',
  // TODO(ADR): Phase D — replace with real Cognito token getter (no call-site changes needed).
  getAuthToken: () => Promise.resolve(null),
});
