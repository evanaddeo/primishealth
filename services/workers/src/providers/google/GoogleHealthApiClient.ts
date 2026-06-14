/**
 * GoogleHealthApiClient — typed HTTP wrapper for the Google Health REST API (CU-039).
 *
 * Encapsulates the four endpoint families documented in TAD §29.1:
 *   - `listDataPoints`      — GET /v4/users/me/dataTypes/{type}/dataPoints
 *   - `reconcileDataPoints` — GET /v4/users/me/dataTypes/{type}/dataPoints:reconcile
 *   - `dailyRollUp`         — POST /v4/users/me/dataTypes/{type}/dataPoints:dailyRollUp
 *   - `listPairedDevices`   — GET /v4/users/me/pairedDevices
 *
 * TAD §29.1 requires these to be distinct methods; do NOT merge them behind a
 * single ambiguous name.
 *
 * The composite `fetchDataType` dispatches to the correct method based on the
 * `DataOperation` in the request and wraps the raw response in a `RawProviderPayload`
 * envelope for the archiving and normalization pipeline (CU-040/CU-041+).
 *
 * All HTTP calls are made through an injected `httpClient` — zero real network
 * calls are possible in Phase E. Inject `globalThis.fetch` in production; pass
 * a mock function in tests.
 *
 * ⚠ This client holds a raw access token value in memory (NOT a secret ref).
 *    The token is obtained by the caller via `SecretStore.getSecret(accessTokenRef)`
 *    BEFORE constructing this client. The client never writes to any store.
 *    It MUST NOT be serialised to logs or passed to HTTP response bodies.
 *
 * Source authority: TAD §29.1 (endpoint families), phase-e plan CU-039.
 */

import { PROVIDER_CODE } from '@primis/core-types';

import { ProviderConnectorError } from '../HealthProviderConnector.js';
import type { RawProviderPayload } from '../types.js';
import type { GoogleHealthDataType } from './dataTypes.js';
import type {
  GoogleHealthListResponse,
  GoogleHealthDailyRollupResponse,
  GooglePairedDevicesResponse,
} from './types.js';
import type {
  ListDataPointsQuery,
  DailyRollupBody,
  SyncWindowRequest,
  SyncWindowResponse,
} from './operations.js';
import { nanosToDate } from './operations.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default base URL for the Google Health REST API.
 *
 * TODO(Phase-AA): verify exact base URL and API version against live API docs.
 *   The TAD §29.1 shows path pattern `/v4/users/me/...`. The actual Google
 *   Health REST API may use a different version prefix (e.g. `/v1/`).
 *   Base URL is injected so this value is only a fallback for production;
 *   tests always provide their own base URL.
 *
 * Source: TAD §29.1 HTTP pattern column.
 */
export const GOOGLE_HEALTH_API_BASE_URL = 'https://health.googleapis.com';

/**
 * API path version prefix used in all data-point endpoint URLs.
 *
 * TODO(Phase-AA): verify version prefix (`v4` vs `v1`) against live docs.
 */
const API_VERSION = 'v4';

// ---------------------------------------------------------------------------
// GoogleHealthApiClientConfig
// ---------------------------------------------------------------------------

/**
 * Constructor configuration for `GoogleHealthApiClient`.
 *
 * All fields are required — the client cannot function without a token and
 * HTTP adapter. There are no module-level singletons.
 */
export interface GoogleHealthApiClientConfig {
  /**
   * Base URL for the Google Health API (e.g. `https://health.googleapis.com`).
   * Override in tests to point at a local mock server or in-process fake.
   */
  baseUrl: string;

  /**
   * Raw OAuth access token VALUE (not a secret ref).
   *
   * The caller MUST resolve this from `SecretStore.getSecret(accessTokenRef)`
   * before constructing the client. The client sends it as `Authorization: Bearer {token}`.
   *
   * NEVER log or include in response bodies. Store only the ARN ref in the DB.
   */
  accessToken: string;

  /**
   * Injectable HTTP fetch function.
   *
   * In production: `globalThis.fetch` (Node 18+ global).
   * In tests: a mock function that returns pre-configured `Response` objects.
   *
   * Zero real network calls are made in Phase E tests.
   */
  httpClient: typeof fetch;
}

// ---------------------------------------------------------------------------
// GoogleHealthApiClient
// ---------------------------------------------------------------------------

/**
 * HTTP wrapper for the Google Health REST API.
 *
 * @example
 * ```typescript
 * const client = new GoogleHealthApiClient({
 *   baseUrl: 'https://health.googleapis.com',
 *   accessToken: rawToken,      // resolved from SecretStore
 *   httpClient: globalThis.fetch,
 * });
 *
 * const response = await client.fetchDataType({
 *   dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
 *   operation: 'dailyRollup',
 *   startTimeNanos: dateToNanos(windowStart),
 *   endTimeNanos:   dateToNanos(windowEnd),
 * });
 * ```
 */
export class GoogleHealthApiClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly httpClient: typeof fetch;

  constructor(config: GoogleHealthApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // strip trailing slash
    this.accessToken = config.accessToken;
    this.httpClient = config.httpClient;
  }

  // ---------------------------------------------------------------------------
  // listDataPoints
  // ---------------------------------------------------------------------------

  /**
   * Fetches data points using the `list` endpoint family.
   *
   * `GET /v4/users/me/dataTypes/{dataType}/dataPoints`
   *
   * Source: TAD §29.1 — endpoint family: "List data points".
   * TODO(Phase-AA): verify query parameter names against live API docs.
   *
   * @param dataType - Google Health data type identifier.
   * @param query    - Date window and optional pagination token.
   * @returns Raw list response with data points and optional `nextPageToken`.
   * @throws `ProviderConnectorError` on HTTP error or malformed response.
   */
  async listDataPoints(
    dataType: GoogleHealthDataType,
    query: ListDataPointsQuery,
  ): Promise<GoogleHealthListResponse> {
    // Source: TAD §29.1 HTTP pattern: GET /v4/users/me/dataTypes/{dataType}/dataPoints
    // TODO(Phase-AA): verify path against live API docs.
    const url = this.buildDataPointsUrl(dataType, undefined, query);
    const body = await this.makeAuthorizedRequest('GET', url);
    return this.parseListResponse(body);
  }

  // ---------------------------------------------------------------------------
  // reconcileDataPoints
  // ---------------------------------------------------------------------------

  /**
   * Fetches data points using the `reconcile` endpoint family.
   *
   * `GET /v4/users/me/dataTypes/{dataType}/dataPoints:reconcile`
   *
   * The reconcile endpoint returns the provider's authoritative stream for the
   * window, which may differ from the `list` result for late-arriving data.
   *
   * Source: TAD §29.1 — endpoint family: "Reconcile data points".
   * TODO(Phase-AA): verify `:reconcile` path suffix and query params against live API docs.
   *
   * @param dataType - Google Health data type identifier.
   * @param query    - Date window and optional pagination token.
   * @returns Reconciled list response with data points and optional `nextPageToken`.
   * @throws `ProviderConnectorError` on HTTP error or malformed response.
   */
  async reconcileDataPoints(
    dataType: GoogleHealthDataType,
    query: ListDataPointsQuery,
  ): Promise<GoogleHealthListResponse> {
    // Source: TAD §29.1 HTTP pattern: GET /v4/users/me/dataTypes/{dataType}/dataPoints:reconcile
    // TODO(Phase-AA): verify path suffix `:reconcile` against live API docs.
    const url = this.buildDataPointsUrl(dataType, ':reconcile', query);
    const body = await this.makeAuthorizedRequest('GET', url);
    return this.parseListResponse(body);
  }

  // ---------------------------------------------------------------------------
  // dailyRollUp
  // ---------------------------------------------------------------------------

  /**
   * Fetches day-level aggregates using the `dailyRollUp` endpoint family.
   *
   * `POST /v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp`
   *
   * Daily rollup returns pre-aggregated rows, one per calendar day, rather than
   * raw interval data points. Preferred for `steps`, `active-energy-burned`,
   * `active-zone-minutes`, `floors`, and `total-calories`.
   *
   * Source: TAD §29.1 — endpoint family: "Daily rollup".
   * TODO(Phase-AA): verify `:dailyRollUp` suffix and response shape (`rows` vs `dataPoints`).
   *
   * @param dataType - Google Health data type identifier.
   * @param body     - Request body with window timestamps.
   * @returns Daily rollup response with aggregated rows.
   * @throws `ProviderConnectorError` on HTTP error or malformed response.
   */
  async dailyRollUp(
    dataType: GoogleHealthDataType,
    body: DailyRollupBody,
  ): Promise<GoogleHealthDailyRollupResponse> {
    // Source: TAD §29.1 HTTP pattern: POST /v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp
    // TODO(Phase-AA): verify path suffix `:dailyRollUp` and POST body shape.
    const url = this.buildDataPointsUrl(dataType, ':dailyRollUp', undefined);
    const rawBody = await this.makeAuthorizedRequest('POST', url, body);
    return this.parseRollupResponse(rawBody);
  }

  // ---------------------------------------------------------------------------
  // listPairedDevices
  // ---------------------------------------------------------------------------

  /**
   * Fetches the user's paired devices (tracker, scale, etc.).
   *
   * `GET /v4/users/me/pairedDevices`
   *
   * Used to populate `provider_devices` with battery level, last sync time,
   * device type, and hardware/software version. Required for the Home card
   * stale-data indicator and battery pill/widget.
   *
   * Source: TAD §29.1 — endpoint family: "Paired devices"; §29.5.
   * TODO(Phase-AA): verify response field names and pagination support.
   *
   * @returns Paired devices response.
   * @throws `ProviderConnectorError` on HTTP error or malformed response.
   */
  async listPairedDevices(): Promise<GooglePairedDevicesResponse> {
    // Source: TAD §29.1 HTTP pattern: GET /v4/users/me/pairedDevices
    // TODO(Phase-AA): verify path against live API docs.
    const url = `${this.baseUrl}/${API_VERSION}/users/me/pairedDevices`;
    const body = await this.makeAuthorizedRequest('GET', url);
    return this.parsePairedDevicesResponse(body);
  }

  // ---------------------------------------------------------------------------
  // fetchDataType — composite dispatcher
  // ---------------------------------------------------------------------------

  /**
   * Dispatches to the appropriate endpoint family and returns a `SyncWindowResponse`.
   *
   * Wraps the raw API response in a `RawProviderPayload` envelope with the
   * correct `providerCode`, `dataType`, window timestamps, and `fetchedAt` time.
   * The `data` field contains the unmodified API response body.
   *
   * Pagination is the caller's responsibility: when `nextPageToken` is present
   * in the response, call this method again with `pageToken` set to that value.
   *
   * @param req - Data type, operation family, window timestamps, and optional page token.
   * @returns Response with one raw payload envelope and optional pagination token.
   * @throws `ProviderConnectorError` on HTTP errors or malformed responses.
   */
  async fetchDataType(req: SyncWindowRequest): Promise<SyncWindowResponse> {
    const fetchedAt = new Date();
    const windowStart = nanosToDate(req.startTimeNanos);
    const windowEnd = nanosToDate(req.endTimeNanos);

    let rawData: unknown;
    let nextPageToken: string | undefined;

    switch (req.operation) {
      case 'list': {
        const response = await this.listDataPoints(req.dataType, {
          startTimeNanos: req.startTimeNanos,
          endTimeNanos: req.endTimeNanos,
          ...(req.pageToken !== undefined ? { pageToken: req.pageToken } : {}),
        });
        rawData = response;
        nextPageToken = response.nextPageToken;
        break;
      }

      case 'reconcile': {
        const response = await this.reconcileDataPoints(req.dataType, {
          startTimeNanos: req.startTimeNanos,
          endTimeNanos: req.endTimeNanos,
          ...(req.pageToken !== undefined ? { pageToken: req.pageToken } : {}),
        });
        rawData = response;
        nextPageToken = response.nextPageToken;
        break;
      }

      case 'dailyRollup': {
        const response = await this.dailyRollUp(req.dataType, {
          startTimeNanos: req.startTimeNanos,
          endTimeNanos: req.endTimeNanos,
        });
        rawData = response;
        // TODO(Phase-AA): confirm whether dailyRollUp supports pagination.
        nextPageToken = undefined;
        break;
      }

      default: {
        // TypeScript exhaustiveness guard — unreachable at runtime.
        const _exhaustive: never = req.operation;
        throw new ProviderConnectorError(
          `Unknown DataOperation: ${String(_exhaustive)}`,
          'UNEXPECTED',
          false,
        );
      }
    }

    const rawPayload: RawProviderPayload = {
      providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
      dataType: req.dataType,
      data: rawData,
      fetchedAt,
      windowStart,
      windowEnd,
    };

    const result: SyncWindowResponse = {
      dataType: req.dataType,
      rawPayloads: [rawPayload],
    };

    if (nextPageToken !== undefined) {
      result.nextPageToken = nextPageToken;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Constructs a data-points URL for the given data type and optional path suffix.
   *
   * Path pattern: `{baseUrl}/{version}/users/me/dataTypes/{dataType}/dataPoints{suffix}`
   * Query string is appended for GET requests (list / reconcile).
   *
   * TODO(Phase-AA): verify exact URL structure against live Google Health API docs.
   */
  private buildDataPointsUrl(
    dataType: GoogleHealthDataType,
    suffix: string | undefined,
    query: ListDataPointsQuery | undefined,
  ): string {
    // Source: TAD §29.1 HTTP pattern columns.
    // TODO(Phase-AA): verify `/v4/users/me/` vs `/v1/users/-/` against live docs.
    const base = `${this.baseUrl}/${API_VERSION}/users/me/dataTypes/${dataType}/dataPoints`;
    const path = suffix !== undefined ? `${base}${suffix}` : base;

    if (query === undefined) {
      return path;
    }

    const params = new URLSearchParams();
    params.set('startTimeNanos', query.startTimeNanos);
    params.set('endTimeNanos', query.endTimeNanos);
    if (query.pageToken !== undefined) {
      params.set('pageToken', query.pageToken);
    }
    return `${path}?${params.toString()}`;
  }

  /**
   * Executes an HTTP request with the `Authorization: Bearer` header.
   *
   * Inspects the HTTP status code and throws `ProviderConnectorError` for:
   *   - 401 → `auth_expired`      (not retryable)
   *   - 403 → `permission_denied` (not retryable)
   *   - 429 → `rate_limited`      (retryable)
   *   - 5xx → `server_error`      (retryable)
   *   - other 4xx → `provider_error` (not retryable)
   *
   * Throws `malformed_response` when the response body cannot be parsed as JSON.
   *
   * @param method - HTTP method (`'GET'` or `'POST'`).
   * @param url    - Fully constructed URL string.
   * @param body   - Optional JSON request body for POST requests.
   * @returns Parsed JSON response body.
   * @throws `ProviderConnectorError` on non-2xx status or JSON parse failure.
   */
  private async makeAuthorizedRequest(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const init: RequestInit = { method, headers };

    if (method === 'POST' && body !== undefined) {
      init.body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await this.httpClient(url, init);
    } catch (err) {
      throw new ProviderConnectorError(
        `Google Health API network error: ${String(err)}`,
        'network_error',
        true,
      );
    }

    if (!response.ok) {
      // Attempt to extract error details from the response body.
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = undefined;
      }
      throw this.buildProviderError(response.status, errorBody);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new ProviderConnectorError(
        `Google Health API returned a non-JSON response for ${url}`,
        'malformed_response',
        false,
      );
    }
    return parsed;
  }

  /**
   * Maps an HTTP error status to a typed `ProviderConnectorError`.
   *
   * Error code mapping (per acceptance criteria):
   *   - 401 → `auth_expired`      (not retryable — token must be refreshed)
   *   - 403 → `permission_denied` (not retryable — scope not granted or revoked)
   *   - 429 → `rate_limited`      (retryable — caller should back off)
   *   - 5xx → `server_error`      (retryable — transient Google-side failure)
   *   - other 4xx → `provider_error` (not retryable)
   */
  private buildProviderError(status: number, errorBody: unknown): ProviderConnectorError {
    const detail = extractGoogleErrorMessage(errorBody);

    switch (true) {
      case status === 401:
        return new ProviderConnectorError(
          `Google Health API: access token expired or invalid (401). ${detail}`,
          'auth_expired',
          false,
        );

      case status === 403:
        return new ProviderConnectorError(
          `Google Health API: permission denied (403). Scope may not be granted. ${detail}`,
          'permission_denied',
          false,
        );

      case status === 429:
        return new ProviderConnectorError(
          `Google Health API: rate limit exceeded (429). ${detail}`,
          'rate_limited',
          true, // retryable
        );

      case status >= 500 && status < 600:
        return new ProviderConnectorError(
          `Google Health API: server error (${status.toString()}). ${detail}`,
          'server_error',
          true, // retryable
        );

      default:
        return new ProviderConnectorError(
          `Google Health API: unexpected error (${status.toString()}). ${detail}`,
          'provider_error',
          false,
        );
    }
  }

  /** Asserts the parsed body has the shape of a list/reconcile response. */
  private parseListResponse(body: unknown): GoogleHealthListResponse {
    if (
      typeof body === 'object' &&
      body !== null &&
      'dataPoints' in body &&
      Array.isArray((body as Record<string, unknown>)['dataPoints'])
    ) {
      return body as GoogleHealthListResponse;
    }
    // Google returns `{}` (empty object) when there are no data points.
    // Treat that as an empty list response.
    if (typeof body === 'object' && body !== null) {
      return { dataPoints: [] };
    }
    throw new ProviderConnectorError(
      `Google Health API: malformed list response — expected { dataPoints: [] }`,
      'malformed_response',
      false,
    );
  }

  /** Asserts the parsed body has the shape of a dailyRollUp response. */
  private parseRollupResponse(body: unknown): GoogleHealthDailyRollupResponse {
    if (
      typeof body === 'object' &&
      body !== null &&
      'rows' in body &&
      Array.isArray((body as Record<string, unknown>)['rows'])
    ) {
      return body as GoogleHealthDailyRollupResponse;
    }
    // Google may return `{}` for an empty rollup window.
    if (typeof body === 'object' && body !== null) {
      return { rows: [] };
    }
    throw new ProviderConnectorError(
      `Google Health API: malformed dailyRollUp response — expected { rows: [] }`,
      'malformed_response',
      false,
    );
  }

  /** Asserts the parsed body has the shape of a pairedDevices response. */
  private parsePairedDevicesResponse(body: unknown): GooglePairedDevicesResponse {
    if (typeof body === 'object' && body !== null) {
      return body as GooglePairedDevicesResponse;
    }
    throw new ProviderConnectorError(
      `Google Health API: malformed pairedDevices response`,
      'malformed_response',
      false,
    );
  }
}

// ---------------------------------------------------------------------------
// Private utilities
// ---------------------------------------------------------------------------

/**
 * Extracts a human-readable error message from a Google Health API error body.
 *
 * Returns an empty string when the body is absent or does not contain a message.
 */
function extractGoogleErrorMessage(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as Record<string, unknown>)['error'] === 'object'
  ) {
    const errorObj = (body as Record<string, unknown>)['error'] as Record<string, unknown>;
    if (typeof errorObj['message'] === 'string') {
      return errorObj['message'];
    }
  }
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const msg = (body as Record<string, unknown>)['message'];
    if (typeof msg === 'string') return msg;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export type { DataOperation, SyncWindowRequest, SyncWindowResponse } from './operations.js';
