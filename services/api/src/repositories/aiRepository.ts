/**
 * Repository for AI conversation, message, context, and invocation tables.
 *
 * Covers:
 *   - `ai_conversations`      (§18.1) — create and query conversations
 *   - `ai_messages`           (§18.2) — add and retrieve message turns
 *   - `ai_context_snapshots`  (§18.3) — store structured context packets
 *   - `ai_model_invocations`  (§18.5) — record cost/usage metadata
 *
 * PRIVACY CRITICAL:
 *   - Never log `ai_messages.content` or `ai_context_snapshots.context_json`.
 *   - `content_redacted` is for audit use only; populate via the redaction pipeline.
 *   - Context snapshots MUST contain structured summaries, not raw health payloads.
 *
 * IMPORTANT: This repository stores AI metadata only. Do NOT make AI model calls,
 * construct prompts, or generate summaries here. Those belong in Phase I.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §18
 * @see docs/source-of-truth/primis_ai_context_engine_spec.md §9, §13
 */

import { db } from '../db/client.js';
import type {
  AiConversation,
  AiConversationUpdate,
  AiMessage,
  NewAiMessage,
  AiContextSnapshot,
  NewAiContextSnapshot,
  AiModelInvocation,
  NewAiModelInvocation,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// ai_conversations
// ---------------------------------------------------------------------------

/**
 * Creates a new AI conversation for a user.
 *
 * @param userId           - Internal user UUID.
 * @param conversationType - Conversation category (default 'chat').
 *   Allowed: 'chat' | 'sleep_summary' | 'workout_summary' |
 *            'recovery_explanation' | 'nutrition_coach'
 * @returns The created conversation row.
 */
export async function createConversation(
  userId: string,
  conversationType = 'chat',
): Promise<AiConversation> {
  const row = await db
    .insertInto('ai_conversations')
    .values({ user_id: userId, conversation_type: conversationType })
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(`createConversation: no row returned for user_id=${userId}`);
  }

  return row;
}

/**
 * Returns a conversation by its primary key.
 *
 * @param id - UUID of the ai_conversations row.
 * @returns The conversation row, or undefined if not found.
 */
export async function getConversation(id: string): Promise<AiConversation | undefined> {
  return db
    .selectFrom('ai_conversations')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

/**
 * Returns all non-deleted conversations for a user, ordered by created_at
 * descending (most recent first).
 *
 * @param userId - Internal user UUID.
 * @param limit  - Maximum rows to return (default 50).
 */
export async function getConversations(userId: string, limit = 50): Promise<AiConversation[]> {
  return db
    .selectFrom('ai_conversations')
    .selectAll()
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
}

/**
 * Soft-deletes a conversation and cascades to its messages.
 *
 * Sets `deleted_at = now()` and `status = 'deleted'`. The `ai_messages` rows
 * are hard-deleted via ON DELETE CASCADE on the conversation FK.
 *
 * @param id - UUID of the ai_conversations row.
 * @returns The updated row, or undefined if not found.
 */
export async function deleteConversation(id: string): Promise<AiConversation | undefined> {
  const now = new Date();
  return db
    .updateTable('ai_conversations')
    .set({ deleted_at: now, status: 'deleted', updated_at: now } satisfies AiConversationUpdate)
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst();
}

// ---------------------------------------------------------------------------
// ai_messages
// ---------------------------------------------------------------------------

/**
 * Appends a message turn to an existing conversation.
 *
 * PRIVACY: `content` may include health context summaries. Do NOT log this value.
 * Pass `contentRedacted` with a sanitised copy for audit purposes when available.
 *
 * @param conversationId  - UUID of the parent ai_conversations row.
 * @param userId          - Internal user UUID (denormalized for fast user queries).
 * @param role            - Message author: 'system' | 'user' | 'assistant' | 'tool'
 * @param content         - Full message text. PRIVACY: do not log.
 * @param meta            - Optional token counts, cost, and latency metadata.
 * @returns The created message row.
 */
export async function addMessage(
  conversationId: string,
  userId: string,
  role: string,
  content: string,
  meta?: Pick<
    NewAiMessage,
    | 'content_redacted'
    | 'model_provider'
    | 'model_name'
    | 'prompt_tokens'
    | 'completion_tokens'
    | 'latency_ms'
    | 'cost_usd'
    | 'metadata'
  >,
): Promise<AiMessage> {
  const row = await db
    .insertInto('ai_messages')
    .values({
      conversation_id: conversationId,
      user_id: userId,
      role,
      content,
      ...meta,
    })
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `addMessage: no row returned for conversation_id=${conversationId}, role=${role}`,
    );
  }

  return row;
}

/**
 * Returns all messages in a conversation ordered by created_at ascending
 * (chronological order).
 *
 * PRIVACY: Do NOT log the returned `content` fields.
 *
 * @param conversationId - UUID of the parent ai_conversations row.
 */
export async function getConversationMessages(conversationId: string): Promise<AiMessage[]> {
  return db
    .selectFrom('ai_messages')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at', 'asc')
    .execute();
}

// ---------------------------------------------------------------------------
// ai_context_snapshots
// ---------------------------------------------------------------------------

/**
 * Stores a structured AI context snapshot.
 *
 * PRIVACY CRITICAL:
 *   - `data.context_json` MUST contain structured summaries, deviations, and
 *     selected facts. Raw health payloads MUST NOT be stored here.
 *   - Application code must enforce this before calling this function.
 *   - Do NOT log `data.context_json`.
 *
 * @param data - Insertable context snapshot row.
 * @returns The created row.
 */
export async function createContextSnapshot(
  data: NewAiContextSnapshot,
): Promise<AiContextSnapshot> {
  const row = await db
    .insertInto('ai_context_snapshots')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `createContextSnapshot: no row returned for user_id=${String(data.user_id)}, ` +
        `context_type=${String(data.context_type)}`,
    );
  }

  return row;
}

/**
 * Returns the most recent context snapshot for a conversation.
 *
 * @param conversationId - UUID of the ai_conversations row.
 * @returns The most recent snapshot, or undefined if none exist.
 */
export async function getLatestContextSnapshot(
  conversationId: string,
): Promise<AiContextSnapshot | undefined> {
  return db
    .selectFrom('ai_context_snapshots')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
}

// ---------------------------------------------------------------------------
// ai_model_invocations
// ---------------------------------------------------------------------------

/**
 * Records an AI model invocation for cost and usage tracking.
 *
 * IMPORTANT: Do NOT store raw prompt text or response text in this record.
 * Use `request_hash` and `response_hash` (SHA-256) for deduplication and audit.
 *
 * @param data - Insertable invocation row.
 * @returns The created row.
 */
export async function recordModelInvocation(
  data: NewAiModelInvocation,
): Promise<AiModelInvocation> {
  const row = await db
    .insertInto('ai_model_invocations')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `recordModelInvocation: no row returned for provider=${String(data.provider)}, ` +
        `model=${String(data.model_name)}`,
    );
  }

  return row;
}

/**
 * Returns recent model invocations for a user, ordered by created_at descending.
 *
 * @param userId - Internal user UUID.
 * @param limit  - Maximum rows to return (default 100).
 */
export async function getModelInvocations(
  userId: string,
  limit = 100,
): Promise<AiModelInvocation[]> {
  return db
    .selectFrom('ai_model_invocations')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
}
