/**
 * Unit tests for `PrimisApiClient`, `parseApiError`, and `MockModeError`.
 *
 * All tests run in a Node.js environment — no native modules are loaded.
 * `fetch` is mocked via `vi.stubGlobal` so no real network calls occur.
 *
 * @see apps/mobile/src/api/client.ts
 * @see apps/mobile/src/api/errors.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, MockModeError, parseApiError } from '../../src/api/errors';
import { PrimisApiClient } from '../../src/api/client';
import { API_ENDPOINTS } from '../../src/api/endpoints';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function makeFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Client factory helpers
// ---------------------------------------------------------------------------

function makeClient(overrides: Partial<ConstructorParameters<typeof PrimisApiClient>[0]> = {}) {
  return new PrimisApiClient({
    baseUrl: 'http://localhost:3000',
    mockMode: false,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// parseApiError
// ---------------------------------------------------------------------------

describe('parseApiError', () => {
  it('maps a valid ApiErrorResponse body to ApiClientError with the backend code', () => {
    const body = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token expired' },
    };
    const err = parseApiError(401, body);

    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Token expired');
    expect(err.status).toBe(401);
  });

  it('maps FORBIDDEN body to ApiClientError with code FORBIDDEN', () => {
    const body = {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    };
    const err = parseApiError(403, body);

    expect(err.code).toBe('FORBIDDEN');
    expect(err.status).toBe(403);
  });

  it('falls back to INTERNAL_ERROR when body does not match the contract', () => {
    const err = parseApiError(500, { message: 'Something went wrong' });

    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.status).toBe(500);
  });

  it('falls back to INTERNAL_ERROR for null body (e.g. gateway HTML error)', () => {
    const err = parseApiError(502, null);

    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/bad gateway/i);
  });

  it('produces a descriptive message for HTTP 400', () => {
    const err = parseApiError(400, null);
    expect(err.message).toMatch(/bad request/i);
  });

  it('produces a descriptive message for HTTP 401', () => {
    const err = parseApiError(401, null);
    expect(err.message).toMatch(/unauthorized/i);
  });

  it('produces a descriptive message for HTTP 404', () => {
    const err = parseApiError(404, null);
    expect(err.message).toMatch(/not found/i);
  });

  it('produces a descriptive message for HTTP 500', () => {
    const err = parseApiError(500, null);
    expect(err.message).toMatch(/internal server error/i);
  });

  it('produces a generic message for an unknown status code', () => {
    const err = parseApiError(418, null);
    expect(err.message).toContain('418');
  });
});

// ---------------------------------------------------------------------------
// ApiClientError
// ---------------------------------------------------------------------------

describe('ApiClientError', () => {
  it('has name "ApiClientError"', () => {
    const err = new ApiClientError('NOT_FOUND', 'Not found', 404);
    expect(err.name).toBe('ApiClientError');
  });

  it('is instanceof Error and instanceof ApiClientError', () => {
    const err = new ApiClientError('NOT_FOUND', 'Not found', 404);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiClientError);
  });

  it('exposes code, message, and status', () => {
    const err = new ApiClientError('VALIDATION_ERROR', 'Invalid field', 422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Invalid field');
    expect(err.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// MockModeError
// ---------------------------------------------------------------------------

describe('MockModeError', () => {
  it('has name "MockModeError"', () => {
    const err = new MockModeError('/v1/dashboard');
    expect(err.name).toBe('MockModeError');
  });

  it('is instanceof Error and instanceof MockModeError', () => {
    const err = new MockModeError('/v1/dashboard');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MockModeError);
  });

  it('exposes the path that was skipped', () => {
    const err = new MockModeError('/v1/dashboard');
    expect(err.path).toBe('/v1/dashboard');
  });

  it('includes the path in the error message', () => {
    const err = new MockModeError('/v1/scores/sleep');
    expect(err.message).toContain('/v1/scores/sleep');
  });
});

// ---------------------------------------------------------------------------
// PrimisApiClient — mock mode
// ---------------------------------------------------------------------------

describe('PrimisApiClient — mockMode: true', () => {
  it('throws MockModeError from get() without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const client = makeClient({ mockMode: true });

    await expect(client.get(API_ENDPOINTS.DASHBOARD)).rejects.toBeInstanceOf(MockModeError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws MockModeError from post() without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const client = makeClient({ mockMode: true });

    await expect(client.post(API_ENDPOINTS.DASHBOARD, {})).rejects.toBeInstanceOf(MockModeError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('MockModeError carries the endpoint path', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const client = makeClient({ mockMode: true });

    const err = await client.get(API_ENDPOINTS.HEALTH).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MockModeError);
    expect((err as MockModeError).path).toBe(API_ENDPOINTS.HEALTH);
  });
});

// ---------------------------------------------------------------------------
// PrimisApiClient — successful responses
// ---------------------------------------------------------------------------

describe('PrimisApiClient — successful responses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unwraps ApiSuccessResponse envelope and returns data', async () => {
    const payload = { score: 82, date: '2026-06-11' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeFetchResponse(200, {
          success: true,
          data: payload,
        }),
      ),
    );

    const client = makeClient();
    const result = await client.get<typeof payload>(API_ENDPOINTS.DASHBOARD);

    expect(result).toEqual(payload);
  });

  it('sends the correct method and URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeFetchResponse(200, {
        success: true,
        data: { ok: true },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ baseUrl: 'https://api.example.com' });
    await client.get('/v1/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('includes Content-Type and Accept headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeFetchResponse(200, {
        success: true,
        data: {},
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.get('/v1/health');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');
  });

  it('does NOT include Authorization header when getAuthToken returns null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeFetchResponse(200, {
        success: true,
        data: {},
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ getAuthToken: () => Promise.resolve(null) });
    await client.get('/v1/health');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('injects Authorization header when getAuthToken returns a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeFetchResponse(200, {
        success: true,
        data: {},
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ getAuthToken: () => Promise.resolve('test-token-abc') });
    await client.get('/v1/health');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-token-abc');
  });

  it('JSON-serializes the body for post()', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeFetchResponse(201, {
        success: true,
        data: { id: '123' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.post('/v1/resource', { name: 'test' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"name":"test"}');
    expect(init.method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// PrimisApiClient — error responses
// ---------------------------------------------------------------------------

describe('PrimisApiClient — error responses', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws ApiClientError for a 401 response with a valid error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeFetchResponse(401, {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Token expired' },
        }),
      ),
    );

    const client = makeClient();
    const err = await client.get('/v1/dashboard').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('UNAUTHORIZED');
    expect((err as ApiClientError).status).toBe(401);
  });

  it('throws ApiClientError for a 404 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeFetchResponse(404, {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Dashboard not found' },
        }),
      ),
    );

    const client = makeClient();
    const err = await client.get('/v1/dashboard').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('NOT_FOUND');
    expect((err as ApiClientError).status).toBe(404);
  });

  it('throws ApiClientError for a 500 response with a non-contract body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(500, '<html>Error</html>')));

    const client = makeClient();
    const err = await client.get('/v1/dashboard').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('INTERNAL_ERROR');
    expect((err as ApiClientError).status).toBe(500);
  });

  it('throws ApiClientError when 2xx response has a malformed envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeFetchResponse(200, {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Unexpected' },
        }),
      ),
    );

    const client = makeClient();
    const err = await client.get('/v1/dashboard').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('INTERNAL_ERROR');
  });
});

// ---------------------------------------------------------------------------
// API_ENDPOINTS constants
// ---------------------------------------------------------------------------

describe('API_ENDPOINTS', () => {
  it('HEALTH is /health', () => {
    expect(API_ENDPOINTS.HEALTH).toBe('/health');
  });

  it('DASHBOARD is /v1/dashboard', () => {
    expect(API_ENDPOINTS.DASHBOARD).toBe('/v1/dashboard');
  });

  it('SCORE_SNAPSHOT contains the :type placeholder', () => {
    expect(API_ENDPOINTS.SCORE_SNAPSHOT).toContain(':type');
  });
});
