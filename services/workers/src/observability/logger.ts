import {
  createRuntimeLogSink,
  createStructuredLogger,
  resolveLogEnvironment,
  type LogEnvironment,
  type LogSink,
  type StructuredLogger,
  type WorkerRuntimeEventName,
} from '@primis/config';

import type { DeletionDryRunAuditEvent } from '../privacy/deleteUserData.js';

export type WorkerLogger = StructuredLogger<WorkerRuntimeEventName>;

export interface WorkerLoggerOptions {
  readonly sink?: LogSink;
  readonly environment?: LogEnvironment;
  readonly now?: () => Date;
}

const WORKER_EVENTS: readonly WorkerRuntimeEventName[] = [
  'privacy.deletion_dry_run.planned',
  'worker.ai_summary.completed',
  'worker.ai_summary.failed',
  'worker.ai_summary.started',
  'worker.sync.completed',
  'worker.sync.failed',
  'worker.sync.started',
];

export function createWorkerLogger(options: WorkerLoggerOptions = {}): WorkerLogger {
  return createStructuredLogger({
    service: 'primis-workers',
    environment: options.environment ?? resolveLogEnvironment(process.env['APP_ENV']),
    sink: options.sink ?? createRuntimeLogSink(),
    allowedEvents: WORKER_EVENTS,
    ...(options.now ? { now: options.now } : {}),
  });
}

export const workerLogger = createWorkerLogger();

/** Adapts the identifier-free CU-087 audit seam to the runtime event registry. */
export function createDeletionDryRunAuditSink(
  logger: WorkerLogger = workerLogger,
  correlationId?: string,
): (event: DeletionDryRunAuditEvent) => void {
  return (event) => {
    logger.emit(
      'privacy.deletion_dry_run.planned',
      {
        categoryCount: event.categoryCount,
        targetCount: event.targetCount,
        archiveObjectCount: event.archiveObjectCount,
        archivePrefixCount: event.archivePrefixCount,
      },
      correlationId ? { correlationId } : {},
    );
  };
}
