/**
 * Google Health API operation types and timestamp utilities (CU-039).
 *
 * Defines the typed operation model for the three Google Health endpoint families
 * (list, reconcile, dailyRollup) and the shared request/response envelope used
 * by `GoogleHealthApiClient.fetchDataType`.
 *
 * The TAD §29.1 mandates explicit methods for each endpoint family — these types
 * enforce that distinction rather than flattening everything into one shape.
 *
 * Timestamp helpers convert between JavaScript `Date` values and Google's
 * nanosecond-precision epoch strings. Nanoseconds are used in all Google Health
 * API timestamp parameters to avoid the precision loss of millisecond values.
 *
 * Source authority: TAD §29.1 (endpoint families), phase-e plan CU-039 §In-Scope Work.
 */

import type { RawProviderPayload } from '../types.js';
import type { GoogleHealthDataType } from './dataTypes.js';

// ---------------------------------------------------------------------------
// DataOperation — explicit operation family discriminant
// ---------------------------------------------------------------------------

/**
 * Identifies which Google Health endpoint family to use for a data fetch.
 *
 * - `'list'`       → `GET /v4/users/me/dataTypes/{type}/dataPoints`
 * - `'reconcile'`  → `GET /v4/users/me/dataTypes/{type}/dataPoints:reconcile`
 * - `'dailyRollup'`→ `POST /v4/users/me/dataTypes/{type}/dataPoints:dailyRollUp`
 *
 * TAD §29.1 requires distinct methods per family; callers must not collapse
 * these behind a single ambiguous method name.
 */
export type DataOperation = 'list' | 'reconcile' | 'dailyRollup';

// ---------------------------------------------------------------------------
// Request types per endpoint family
// ---------------------------------------------------------------------------

/**
 * Query parameters shared by the `list` and `reconcile` endpoint families.
 *
 * Both endpoints use GET with nanosecond timestamps as query parameters.
 * `pageToken` is present only when paginating; omit on the first request.
 *
 * TODO(Phase-AA): verify exact query parameter names against live API docs.
 */
export interface ListDataPointsQuery {
  /**
   * Start of the data window in nanoseconds since epoch (decimal string).
   * Use `dateToNanos()` to convert from `Date`.
   */
  startTimeNanos: string;
  /**
   * End of the data window in nanoseconds since epoch (decimal string).
   * Use `dateToNanos()` to convert from `Date`.
   */
  endTimeNanos: string;
  /**
   * Pagination token from the previous response's `nextPageToken` field.
   * Omit on the first request to a window.
   */
  pageToken?: string;
}

/**
 * Request body for the `dailyRollUp` endpoint.
 *
 * Daily rollup uses POST with a JSON body rather than GET query parameters.
 *
 * TODO(Phase-AA): verify exact field names and whether `pageToken` applies
 *   to daily rollup responses in live validation.
 */
export interface DailyRollupBody {
  /** Start of the rollup window in nanoseconds (decimal string). */
  startTimeNanos: string;
  /** End of the rollup window in nanoseconds (decimal string). */
  endTimeNanos: string;
}

// ---------------------------------------------------------------------------
// SyncWindowRequest / SyncWindowResponse — composite fetch envelope
// ---------------------------------------------------------------------------

/**
 * Input to `GoogleHealthApiClient.fetchDataType`.
 *
 * Encodes all parameters needed to call any Google Health endpoint family
 * for a single data type and time window.
 *
 * The `operation` field selects which endpoint family to use.
 * Callers should use `PREFERRED_OPERATION_FOR_DATA_TYPE` from `dataTypes.ts`
 * to pick the right operation for a given data type, or override explicitly.
 */
export interface SyncWindowRequest {
  /** Google Health data type identifier (e.g. `'steps'`, `'sleep'`). */
  dataType: GoogleHealthDataType;
  /** Which endpoint family to use for this fetch. */
  operation: DataOperation;
  /** Window start in nanoseconds (decimal string). Use `dateToNanos()`. */
  startTimeNanos: string;
  /** Window end in nanoseconds (decimal string). Use `dateToNanos()`. */
  endTimeNanos: string;
  /**
   * Pagination token for subsequent pages.
   * Omit on the first request; pass the previous response's `nextPageToken`
   * to fetch the next page.
   */
  pageToken?: string;
}

/**
 * Output from `GoogleHealthApiClient.fetchDataType`.
 *
 * `rawPayloads` contains one `RawProviderPayload` wrapping the raw HTTP response
 * body for this page. Pagination is the caller's responsibility: when
 * `nextPageToken` is present, repeat the request with `pageToken` set to
 * this value until `nextPageToken` is absent.
 *
 * Source: phase-e plan CU-039 §In-Scope Work — operations.ts.
 */
export interface SyncWindowResponse {
  /** The data type that was fetched. */
  dataType: GoogleHealthDataType;
  /**
   * Raw provider payloads from this page of data.
   * Typically one element per `fetchDataType` call (one HTTP response per envelope).
   */
  rawPayloads: RawProviderPayload[];
  /**
   * Pagination token for the next page.
   * When present, the caller must make another `fetchDataType` call with
   * `pageToken` set to this value to retrieve the next page.
   * `undefined` indicates this is the last (or only) page.
   */
  nextPageToken?: string;
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Converts a JavaScript `Date` to a Google Health API nanosecond timestamp string.
 *
 * Google Health API timestamps are epoch nanoseconds represented as decimal strings.
 * Simple multiplication by 1e6 is avoided because the result exceeds
 * `Number.MAX_SAFE_INTEGER` (~9.007e15) for modern dates; BigInt is required.
 *
 * @example
 * dateToNanos(new Date('2024-01-15T00:00:00Z'))
 * // → '1705276800000000000'
 *
 * @param date - UTC date to convert.
 * @returns Nanosecond epoch string safe for use in Google Health API params.
 */
export function dateToNanos(date: Date): string {
  return (BigInt(date.getTime()) * BigInt(1_000_000)).toString();
}

/**
 * Converts a Google Health API nanosecond timestamp string to a JavaScript `Date`.
 *
 * BigInt is used to avoid precision loss from floating-point division.
 *
 * @example
 * nanosToDate('1705276800000000000')
 * // → new Date('2024-01-15T00:00:00.000Z')
 *
 * @param nanos - Nanosecond epoch string from a Google Health API response.
 * @returns UTC `Date` representing the timestamp.
 */
export function nanosToDate(nanos: string): Date {
  return new Date(Number(BigInt(nanos) / BigInt(1_000_000)));
}
