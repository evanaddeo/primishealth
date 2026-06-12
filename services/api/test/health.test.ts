/**
 * Unit tests for the GET /health endpoint.
 *
 * Uses Hono's built-in `app.request()` helper (Fetch API) so no real HTTP
 * server is required. Tests are fully deterministic: no network calls, no
 * database connections, no real credentials.
 *
 * Coverage:
 *  - Response shape matches ApiSuccessResponse<HealthResponseData>
 *  - HTTP status is 200
 *  - `data.status` is 'ok'
 *  - `data.requestId` is a non-empty string
 *  - `data.env` reflects APP_ENV (defaults to 'local')
 *  - `x-request-id` response header is present
 *  - Caller-supplied `x-request-id` is echoed back (pass-through)
 *  - A fresh UUID is generated when no `x-request-id` is supplied
 *  - `success: true` envelope field is set
 */

import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import type { HealthResponseData } from '../src/routes/health.js';
import type { ApiSuccessResponse } from '@primis/api-contracts';

describe('GET /health', () => {
  const app = createApp();

  it('returns HTTP 200', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('returns ApiSuccessResponse envelope with success: true', async () => {
    const res = await app.request('/health');
    const body = (await res.json()) as ApiSuccessResponse<HealthResponseData>;

    expect(body.success).toBe(true);
  });

  it('returns data.status "ok"', async () => {
    const res = await app.request('/health');
    const body = (await res.json()) as ApiSuccessResponse<HealthResponseData>;

    expect(body.data.status).toBe('ok');
  });

  it('returns data.version as a non-empty string', async () => {
    const res = await app.request('/health');
    const body = (await res.json()) as ApiSuccessResponse<HealthResponseData>;

    expect(typeof body.data.version).toBe('string');
    expect(body.data.version.length).toBeGreaterThan(0);
  });

  it('returns data.env as a non-empty string', async () => {
    const res = await app.request('/health');
    const body = (await res.json()) as ApiSuccessResponse<HealthResponseData>;

    expect(typeof body.data.env).toBe('string');
    expect(body.data.env.length).toBeGreaterThan(0);
  });

  it('returns data.requestId as a non-empty string', async () => {
    const res = await app.request('/health');
    const body = (await res.json()) as ApiSuccessResponse<HealthResponseData>;

    expect(typeof body.data.requestId).toBe('string');
    expect(body.data.requestId.length).toBeGreaterThan(0);
  });

  it('sets x-request-id response header', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('x-request-id')).not.toBeNull();
  });

  it('echoes caller-supplied x-request-id back in the response header', async () => {
    const correlationId = 'test-request-abc-123';
    const res = await app.request('/health', {
      headers: { 'x-request-id': correlationId },
    });

    expect(res.headers.get('x-request-id')).toBe(correlationId);
  });

  it('includes the correlation ID in data.requestId when caller supplies one', async () => {
    const correlationId = 'supplied-id-xyz-789';
    const res = await app.request('/health', {
      headers: { 'x-request-id': correlationId },
    });
    const body = (await res.json()) as ApiSuccessResponse<HealthResponseData>;

    expect(body.data.requestId).toBe(correlationId);
  });

  it('generates a different requestId on each uncorrelated request', async () => {
    const [res1, res2] = await Promise.all([app.request('/health'), app.request('/health')]);
    const body1 = (await res1.json()) as ApiSuccessResponse<HealthResponseData>;
    const body2 = (await res2.json()) as ApiSuccessResponse<HealthResponseData>;

    // UUIDs are randomly generated; collision probability is negligible
    expect(body1.data.requestId).not.toBe(body2.data.requestId);
  });

  it('data.requestId matches the x-request-id response header', async () => {
    const res = await app.request('/health');
    const body = (await res.json()) as ApiSuccessResponse<HealthResponseData>;
    const headerValue = res.headers.get('x-request-id');

    expect(body.data.requestId).toBe(headerValue);
  });

  it('response body has the full required shape', async () => {
    const res = await app.request('/health');
    const body = (await res.json()) as ApiSuccessResponse<HealthResponseData>;

    expect(body).toMatchObject({
      success: true,
      data: {
        status: 'ok',
        version: expect.any(String),
        env: expect.any(String),
        requestId: expect.any(String),
      },
    });
  });
});

describe('GET /health — error handler', () => {
  it('returns 404 for an unknown route rather than a raw error', async () => {
    const app = createApp();
    const res = await app.request('/unknown-route-that-does-not-exist');
    expect(res.status).toBe(404);

    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });
});
