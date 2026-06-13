/**
 * Lambda handler and local development server entrypoint for the Primis API.
 *
 * This file serves two roles in a single module:
 *
 * 1. **Lambda export** (`handler`): wraps the Hono app with the AWS Lambda
 *    adapter so it can be deployed as a Lambda function behind API Gateway.
 *    The adapter translates Lambda event/context objects into Fetch API
 *    Request objects that Hono can process.
 *
 * 2. **Local dev server**: when `APP_ENV=local` and `NODE_ENV` is not `test`,
 *    starts an HTTP server via `@hono/node-server` on port 3000. This allows
 *    running `pnpm dev` locally without any Lambda runtime or Docker.
 *
 * Assumption (D-A-004): `hono/aws-lambda` is the correct sub-path export within
 * the core `hono` package for the Lambda adapter. The Phase D plan refers to this
 * as `hono/lambda`, but the actual export path in Hono 4.x is `hono/aws-lambda`.
 * This is a non-material naming difference; no external `@hono/aws-lambda` package
 * is added.
 *
 * No real AWS credentials, Cognito values, or database connections are required
 * for CU-024. The health endpoint is reachable without any backend env vars.
 */

import { serve } from '@hono/node-server';
import { handle } from 'hono/aws-lambda';

import { createApp } from './app.js';

const app = createApp();

/**
 * AWS Lambda handler exported for use with API Gateway (HTTP API or REST API).
 *
 * CU-024: Lambda deploy is NOT required. This export exists so the module shape
 * is correct for future deployment wiring in Phase Z.
 */
export const handler = handle(app);

// ── Local development server ────────────────────────────────────────────────
// Only starts when APP_ENV=local AND not in a test environment. In Lambda
// deployments, APP_ENV is 'prod' or 'staging', so this block never executes.
if (process.env['APP_ENV'] === 'local' && process.env['NODE_ENV'] !== 'test') {
  const PORT = 3000;

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.error(`[api] Local server running at http://localhost:${info.port}`);
    console.error('[api] Health: GET http://localhost:' + info.port + '/health');
  });
}
