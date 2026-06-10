/**
 * Lightweight pagination contract for list endpoints.
 *
 * Supports both offset/page-based and cursor-based pagination in a single shape.
 * Cursor-based pagination is indicated by the presence of the optional `cursor` field.
 *
 * This contract is intentionally minimal — route-specific list responses will
 * compose `PaginatedResponse<T>` with their own item type in Phase D.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// PaginationMeta
// ---------------------------------------------------------------------------

/**
 * Metadata describing the current page of a paginated list response.
 *
 * - `page` / `pageSize` — offset-based position; `page` is 1-indexed.
 * - `total`             — total item count across all pages (may be approximate for cursor mode).
 * - `hasNext`           — whether a next page exists.
 * - `hasPrev`           — whether a previous page exists.
 * - `cursor`            — opaque continuation token for cursor-based pagination; absent for the
 *                         last page or when using pure offset pagination.
 */
export interface PaginationMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
  readonly cursor?: string;
}

/**
 * Zod schema for {@link PaginationMeta}.
 *
 * Note: `satisfies z.ZodType<PaginationMeta>` is omitted — the workspace tsconfig
 * enables `exactOptionalPropertyTypes`, which makes the optional `cursor` field
 * inferred by Zod (`string | undefined`) incompatible with the TS optional property
 * at the satisfies call site. Runtime validation behaviour is unaffected.
 */
export const PaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(500),
  total: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
  cursor: z.string().optional(),
});

// ---------------------------------------------------------------------------
// PaginatedResponse
// ---------------------------------------------------------------------------

/**
 * Generic wrapper for paginated list payloads.
 *
 * Used as the `data` field inside `ApiSuccessResponse`:
 *
 * ```ts
 * type HealthMetricListResponse = ApiSuccessResponse<PaginatedResponse<HealthMetricDto>>;
 * ```
 *
 * @template T — the item type for a single list entry.
 */
export interface PaginatedResponse<T> {
  readonly items: T[];
  readonly pagination: PaginationMeta;
}

/**
 * Base Zod schema for `PaginatedResponse<unknown>`.
 *
 * Uses `z.unknown()` for items so it compiles without knowing T.
 * Callers should compose with the concrete item schema:
 *
 * ```ts
 * const MyListSchema = z.object({
 *   items: z.array(MyItemSchema),
 *   pagination: PaginationMetaSchema,
 * });
 * ```
 */
export const PaginatedResponseSchema = z.object({
  items: z.array(z.unknown()),
  pagination: PaginationMetaSchema,
});

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Construct a `PaginatedResponse<T>` from a slice of items and pagination metadata.
 *
 * @param items      — the current page's items.
 * @param pagination — the pagination metadata for this page.
 */
export function makePaginatedResponse<T>(
  items: T[],
  pagination: PaginationMeta,
): PaginatedResponse<T> {
  return { items, pagination };
}
