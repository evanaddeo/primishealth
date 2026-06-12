/**
 * Health check route for the Primis API.
 *
 * `GET /health` — intentionally not versioned under `/api/v1/` so that load
 * balancers, API Gateway health probes, and local smoke tests can reach it
 * without an auth header.
 *
 * Response payload (wrapped in ApiSuccessResponse):
 *   - status:    'ok' literal — confirms the handler is reachable
 *   - version:   npm package version string from process.env
 *   - env:       APP_ENV value from the public environment schema
 *   - requestId: correlation ID propagated by requestIdMiddleware
 *
 * Security note: this route must NEVER include database connection state,
 * stack traces, raw error messages, environment credentials, or any field
 * that could leak information about the deployment.
 */

import { Hono } from 'hono';
import { makeSuccessResponse } from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';

/** Shape of the /health response data payload. */
export interface HealthResponseData {
  readonly status: 'ok';
  readonly version: string;
  readonly env: string;
  readonly requestId: string;
}

/** Hono sub-application for the health route. */
export const healthRouter = new Hono<{ Variables: { requestId: string } }>();

healthRouter.get('/', (c) => {
  const env = loadPublicEnv();
  const version = process.env['npm_package_version'] ?? '0.0.0';
  const requestId = c.var.requestId;

  const data: HealthResponseData = {
    status: 'ok',
    version,
    env: env.APP_ENV,
    requestId,
  };

  return c.json(makeSuccessResponse(data, undefined, requestId), 200);
});
