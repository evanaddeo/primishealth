/**
 * HealthKit enable + local-health upload routes (CU-098).
 *
 * Routes (require `authMiddleware`, mounted at `/api/v1/me/providers/healthkit`):
 *   POST /         — grant the submitted healthkit consent version and
 *                    create/reactivate the caller's tokenless connection
 *   POST /uploads  — bounded, retry-safe batch upload into the existing
 *                    normalized ingestion writer
 *
 * Authority rules: user identity comes only from `authMiddleware`; the
 * provider code is fixed to canonical 'healthkit'; the connection is resolved
 * server-side. The strict contracts reject any spoofed authority field, and
 * batch/body bounds are enforced before any service work.
 *
 * Response safety: only aggregate counts, bounded error codes with indexes,
 * and capped affected dates are returned. Submitted records are never echoed,
 * and this module performs no logging of its own — the body-free request
 * logging middleware (Phase J) is the only log source on this path.
 *
 * @see packages/api-contracts/src/localHealthUpload.ts — wire contracts
 * @see services/api/src/services/localHealthUploadService.ts — orchestration
 * @see plans/phase-k-post-mvp-expansion-stubs.md — §11.4, §12/CU-098
 */

import { Hono, type Context } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  EnableHealthKitRequestDtoSchema,
  EnableHealthKitResponseDtoSchema,
  LocalHealthUploadRequestDtoSchema,
  LocalHealthUploadResponseDtoSchema,
  type LocalHealthUploadInProgressDetails,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import {
  createLocalHealthUploadService,
  type LocalHealthUploadService,
} from '../services/localHealthUploadService.js';

type RouteContext = Context<{ Variables: AuthVariables & { requestId: string } }>;

async function readJsonBody(
  c: RouteContext,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

function invalidJsonResponse(c: RouteContext, requestId: string | undefined) {
  return c.json(
    makeErrorResponse(
      'VALIDATION_ERROR',
      'Request body must be valid JSON.',
      undefined,
      undefined,
      requestId,
    ),
    400,
  );
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createHealthKitRouter(
  service: LocalHealthUploadService = createLocalHealthUploadService(),
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  // ── POST / — grant consent + enable/reactivate the tokenless connection ───
  router.post('/', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const body = await readJsonBody(c);
    if (!body.ok) return invalidJsonResponse(c, requestId);

    const parsed = EnableHealthKitRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid HealthKit enable payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const result = await service.enable(internalUserId, parsed.data.consentVersion);
    const dto = EnableHealthKitResponseDtoSchema.parse(result);
    return c.json(makeSuccessResponse(dto, undefined, requestId), 201);
  });

  // ── POST /uploads — bounded, retry-safe local-health batch upload ─────────
  router.post('/uploads', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const body = await readJsonBody(c);
    if (!body.ok) return invalidJsonResponse(c, requestId);

    const parsed = LocalHealthUploadRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      // Envelope-level failure (bad batchId, batch bounds, spoofed fields).
      // Issue paths are structural only; record content is never echoed.
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid local-health upload batch.',
          {
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path,
              code: issue.code,
            })),
          },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const outcome = await service.upload(internalUserId, parsed.data);

    switch (outcome.kind) {
      case 'ok': {
        const dto = LocalHealthUploadResponseDtoSchema.parse(outcome.response);
        return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
      }
      case 'connection_required':
        return c.json(
          makeErrorResponse(
            'FORBIDDEN',
            'An active HealthKit connection is required before uploading.',
            undefined,
            undefined,
            requestId,
          ),
          403,
        );
      case 'consent_required':
        return c.json(
          makeErrorResponse(
            'FORBIDDEN',
            'Current HealthKit consent is required before uploading.',
            undefined,
            undefined,
            requestId,
          ),
          403,
        );
      case 'batch_in_progress': {
        const details: LocalHealthUploadInProgressDetails = {
          batchStatus: 'in_progress',
          retryable: true,
        };
        return c.json(
          makeErrorResponse(
            'CONFLICT',
            'This upload batch is still being processed. Retry shortly.',
            details,
            undefined,
            requestId,
          ),
          409,
        );
      }
      case 'batch_conflict':
        // Uniform message for foreign-owner collisions — never reveals
        // whether or to whom the batch id belongs (plan §12/CU-098 §13).
        return c.json(
          makeErrorResponse(
            'CONFLICT',
            'This batch ID cannot be used.',
            undefined,
            undefined,
            requestId,
          ),
          409,
        );
    }
  });

  return router;
}

/** HealthKit router wired to the real service and repositories. */
export const healthKitRouter = createHealthKitRouter();
