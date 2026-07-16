/** Authenticated latest cached AI-summary route (CU-090). */

import { Hono } from 'hono';

import {
  AiSummaryEvidenceRefSchema,
  AiSummaryTypeSchema,
  LatestAiSummaryResponseSchema,
  makeErrorResponse,
  makeSuccessResponse,
  type AiSummaryEvidenceRef,
  type LatestAiSummaryResponse,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import type { AiSummary } from '../db/types.js';
import { getLatestAiSummaryForUser } from '../repositories/aiSummaryRepository.js';

export interface AiSummariesRouteDeps {
  readonly getLatest: (userId: string, summaryType: string) => Promise<AiSummary | undefined>;
}

const DEFAULT_DEPS: AiSummariesRouteDeps = { getLatest: getLatestAiSummaryForUser };

function parseEvidence(value: unknown): AiSummaryEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  const evidence: AiSummaryEvidenceRef[] = [];
  for (const item of value) {
    const parsed = AiSummaryEvidenceRefSchema.safeParse(item);
    if (parsed.success) evidence.push(parsed.data);
  }
  return evidence;
}

export function mapAiSummaryRow(row: AiSummary | undefined): LatestAiSummaryResponse {
  if (row === undefined) return { state: 'empty', summary: null };

  return LatestAiSummaryResponseSchema.parse({
    state: 'available',
    summary: {
      summaryType: row.summary_type,
      localDate: row.local_date,
      status: row.summary_status,
      title: row.title,
      shortSummary: row.short_summary,
      evidence: parseEvidence(row.evidence_refs),
      contextPacketVersion: row.context_packet_version,
      generatedAt: row.generated_at.toISOString(),
      expiresAt: row.expires_at?.toISOString() ?? null,
    },
  });
}

export function createAiSummariesRouter(
  deps: AiSummariesRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  router.get('/summaries/latest', async (c) => {
    const requestId = c.get('requestId') as string | undefined;
    const parsedType = AiSummaryTypeSchema.safeParse(c.req.query('type'));
    if (!parsedType.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'A supported AI summary type is required.',
          undefined,
          'type',
          requestId,
        ),
        400,
      );
    }

    const row = await deps.getLatest(c.var.user.internalUserId, parsedType.data);
    const response = mapAiSummaryRow(row);
    return c.json(makeSuccessResponse(response, undefined, requestId), 200);
  });

  return router;
}

export const aiSummariesRouter = createAiSummariesRouter();
