/**
 * Tests for the CU-011 API contract envelope, error codes, and pagination.
 *
 * Coverage targets (from CU-011 acceptance criteria):
 * - makeSuccessResponse returns { success: true, data }
 * - makeErrorResponse returns { success: false, error: { code, message } }
 * - Zod schema rejects a "success" response missing the data field
 * - Zod schema rejects an ApiError with an unknown code
 * - PaginationMeta schema validates and rejects invalid shapes
 * - makeErrorResponse with optional details and field
 * - ApiResponseSchema discriminated union narrowing
 * - makeSuccessResponse with optional meta and requestId
 */

import { describe, expect, it } from 'vitest';

import {
  ApiErrorResponseSchema,
  ApiResponseSchema,
  ApiSuccessResponseSchema,
  makeErrorResponse,
  makeSuccessResponse,
} from '../src/envelope.js';
import { ApiErrorCodeSchema, ApiErrorSchema } from '../src/errors.js';
import {
  PaginationMetaSchema,
  PaginatedResponseSchema,
  makePaginatedResponse,
} from '../src/pagination.js';

// ---------------------------------------------------------------------------
// makeSuccessResponse
// ---------------------------------------------------------------------------

describe('makeSuccessResponse', () => {
  it('returns a success envelope with the provided data', () => {
    const result = makeSuccessResponse({ id: '1' });
    expect(result).toEqual({ success: true, data: { id: '1' } });
  });

  it('sets success to true', () => {
    expect(makeSuccessResponse(null).success).toBe(true);
  });

  it('includes meta when provided', () => {
    const result = makeSuccessResponse(42, { cacheAge: 30 });
    expect(result.meta).toEqual({ cacheAge: 30 });
  });

  it('omits meta when not provided', () => {
    const result = makeSuccessResponse({ ok: true });
    expect('meta' in result).toBe(false);
  });

  it('includes requestId when provided', () => {
    const result = makeSuccessResponse('x', undefined, 'req-abc');
    expect(result.requestId).toBe('req-abc');
  });

  it('omits requestId when not provided', () => {
    const result = makeSuccessResponse('x');
    expect('requestId' in result).toBe(false);
  });

  it('preserves array payloads', () => {
    const items = [1, 2, 3];
    expect(makeSuccessResponse(items).data).toEqual(items);
  });
});

// ---------------------------------------------------------------------------
// makeErrorResponse
// ---------------------------------------------------------------------------

describe('makeErrorResponse', () => {
  it('returns an error envelope with the correct code and message', () => {
    const result = makeErrorResponse('NOT_FOUND', 'Resource not found');
    expect(result).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });
  });

  it('sets success to false', () => {
    expect(makeErrorResponse('INTERNAL_ERROR', 'Boom').success).toBe(false);
  });

  it('includes details when provided', () => {
    const result = makeErrorResponse('VALIDATION_ERROR', 'Invalid input', {
      field: 'email',
      issue: 'required',
    });
    expect(result.error.details).toEqual({ field: 'email', issue: 'required' });
  });

  it('omits details when not provided', () => {
    const result = makeErrorResponse('UNAUTHORIZED', 'Unauthorized');
    expect('details' in result.error).toBe(false);
  });

  it('includes field when provided', () => {
    const result = makeErrorResponse('VALIDATION_ERROR', 'Bad field', undefined, 'email');
    expect(result.error.field).toBe('email');
  });

  it('includes requestId when provided', () => {
    const result = makeErrorResponse('FORBIDDEN', 'Forbidden', undefined, undefined, 'req-xyz');
    expect(result.requestId).toBe('req-xyz');
  });

  it('supports every defined error code', () => {
    const codes = ApiErrorCodeSchema.options;
    for (const code of codes) {
      const result = makeErrorResponse(code, 'test');
      expect(result.error.code).toBe(code);
    }
  });
});

// ---------------------------------------------------------------------------
// ApiSuccessResponseSchema (Zod)
// ---------------------------------------------------------------------------

describe('ApiSuccessResponseSchema', () => {
  it('accepts a valid success response', () => {
    const parsed = ApiSuccessResponseSchema.safeParse({ success: true, data: { id: '1' } });
    expect(parsed.success).toBe(true);
  });

  it('rejects a response with success: true but no data field', () => {
    const parsed = ApiSuccessResponseSchema.safeParse({ success: true });
    expect(parsed.success).toBe(false);
  });

  it('rejects success: false', () => {
    const parsed = ApiSuccessResponseSchema.safeParse({ success: false, data: {} });
    expect(parsed.success).toBe(false);
  });

  it('accepts null as a valid data value', () => {
    const parsed = ApiSuccessResponseSchema.safeParse({ success: true, data: null });
    expect(parsed.success).toBe(true);
  });

  it('accepts optional meta', () => {
    const parsed = ApiSuccessResponseSchema.safeParse({
      success: true,
      data: {},
      meta: { version: '1.0.0' },
    });
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ApiErrorResponseSchema (Zod)
// ---------------------------------------------------------------------------

describe('ApiErrorResponseSchema', () => {
  it('accepts a valid error response', () => {
    const parsed = ApiErrorResponseSchema.safeParse({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an error response missing the error field', () => {
    const parsed = ApiErrorResponseSchema.safeParse({ success: false });
    expect(parsed.success).toBe(false);
  });

  it('rejects an error response with an unknown code', () => {
    const parsed = ApiErrorResponseSchema.safeParse({
      success: false,
      error: { code: 'MADE_UP_ERROR', message: 'Oops' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects success: true', () => {
    const parsed = ApiErrorResponseSchema.safeParse({
      success: true,
      error: { code: 'INTERNAL_ERROR', message: 'Err' },
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ApiResponseSchema discriminated union (Zod)
// ---------------------------------------------------------------------------

describe('ApiResponseSchema', () => {
  it('accepts a success branch', () => {
    const parsed = ApiResponseSchema.safeParse({ success: true, data: 'hello' });
    expect(parsed.success).toBe(true);
  });

  it('accepts an error branch', () => {
    const parsed = ApiResponseSchema.safeParse({
      success: false,
      error: { code: 'CONFLICT', message: 'Already exists' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a payload with neither branch shape', () => {
    const parsed = ApiResponseSchema.safeParse({ foo: 'bar' });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ApiErrorSchema (Zod)
// ---------------------------------------------------------------------------

describe('ApiErrorSchema', () => {
  it('accepts a minimal error object', () => {
    const parsed = ApiErrorSchema.safeParse({ code: 'UNAUTHORIZED', message: 'Not logged in' });
    expect(parsed.success).toBe(true);
  });

  it('rejects an error with an unknown code', () => {
    const parsed = ApiErrorSchema.safeParse({ code: 'UNKNOWN_CODE', message: 'Oops' });
    expect(parsed.success).toBe(false);
  });

  it('rejects an error with an empty message', () => {
    const parsed = ApiErrorSchema.safeParse({ code: 'NOT_FOUND', message: '' });
    expect(parsed.success).toBe(false);
  });

  it('accepts optional details and field', () => {
    const parsed = ApiErrorSchema.safeParse({
      code: 'VALIDATION_ERROR',
      message: 'Bad value',
      details: { key: 'value' },
      field: 'username',
    });
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ApiErrorCodeSchema (Zod)
// ---------------------------------------------------------------------------

describe('ApiErrorCodeSchema', () => {
  const validCodes = [
    'UNAUTHORIZED',
    'FORBIDDEN',
    'VALIDATION_ERROR',
    'NOT_FOUND',
    'MISSING_DATA',
    'STALE_DATA',
    'PROVIDER_ERROR',
    'PROVIDER_RATE_LIMIT',
    'INTERNAL_ERROR',
    'SERVICE_UNAVAILABLE',
    'CONFLICT',
  ] as const;

  it('contains exactly 11 error codes', () => {
    expect(ApiErrorCodeSchema.options).toHaveLength(11);
  });

  it.each(validCodes)('accepts code %s', (code) => {
    expect(ApiErrorCodeSchema.safeParse(code).success).toBe(true);
  });

  it('rejects unknown codes', () => {
    expect(ApiErrorCodeSchema.safeParse('RATE_LIMITED').success).toBe(false);
    expect(ApiErrorCodeSchema.safeParse('').success).toBe(false);
    expect(ApiErrorCodeSchema.safeParse(404).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PaginationMetaSchema (Zod)
// ---------------------------------------------------------------------------

describe('PaginationMetaSchema', () => {
  const validMeta = {
    page: 1,
    pageSize: 20,
    total: 100,
    hasNext: true,
    hasPrev: false,
  };

  it('accepts a valid pagination meta object', () => {
    expect(PaginationMetaSchema.safeParse(validMeta).success).toBe(true);
  });

  it('accepts an optional cursor', () => {
    const parsed = PaginationMetaSchema.safeParse({ ...validMeta, cursor: 'abc123' });
    expect(parsed.success).toBe(true);
  });

  it('rejects page < 1', () => {
    expect(PaginationMetaSchema.safeParse({ ...validMeta, page: 0 }).success).toBe(false);
  });

  it('rejects pageSize < 1', () => {
    expect(PaginationMetaSchema.safeParse({ ...validMeta, pageSize: 0 }).success).toBe(false);
  });

  it('rejects pageSize > 500', () => {
    expect(PaginationMetaSchema.safeParse({ ...validMeta, pageSize: 501 }).success).toBe(false);
  });

  it('rejects total < 0', () => {
    expect(PaginationMetaSchema.safeParse({ ...validMeta, total: -1 }).success).toBe(false);
  });

  it('rejects non-boolean hasNext', () => {
    expect(PaginationMetaSchema.safeParse({ ...validMeta, hasNext: 'yes' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PaginatedResponseSchema (Zod)
// ---------------------------------------------------------------------------

describe('PaginatedResponseSchema', () => {
  it('accepts a valid paginated response', () => {
    const parsed = PaginatedResponseSchema.safeParse({
      items: [{ id: 1 }, { id: 2 }],
      pagination: { page: 1, pageSize: 10, total: 2, hasNext: false, hasPrev: false },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a response missing items', () => {
    const parsed = PaginatedResponseSchema.safeParse({
      pagination: { page: 1, pageSize: 10, total: 0, hasNext: false, hasPrev: false },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a response missing pagination', () => {
    const parsed = PaginatedResponseSchema.safeParse({ items: [] });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// makePaginatedResponse
// ---------------------------------------------------------------------------

describe('makePaginatedResponse', () => {
  it('wraps items and pagination into a PaginatedResponse', () => {
    const pagination = {
      page: 2,
      pageSize: 10,
      total: 25,
      hasNext: true,
      hasPrev: true,
    };
    const result = makePaginatedResponse([{ id: 'a' }], pagination);
    expect(result.items).toEqual([{ id: 'a' }]);
    expect(result.pagination).toEqual(pagination);
  });

  it('handles empty items array', () => {
    const pagination = { page: 1, pageSize: 10, total: 0, hasNext: false, hasPrev: false };
    const result = makePaginatedResponse([], pagination);
    expect(result.items).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });
});
