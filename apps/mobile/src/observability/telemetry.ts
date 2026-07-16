/**
 * Vendor-neutral mobile telemetry boundary (CU-089).
 *
 * The default transport is deliberately silent. A future Phase Z vendor adapter
 * may implement `MobileTelemetryTransport`, but it must receive only the bounded
 * DTO produced here—never an Error, route params, app state, or query data.
 */

import {
  SAFE_ERROR_CLASSIFICATIONS,
  classifyError,
  sanitizeCorrelationId,
  type SafeErrorClassification,
  type SafeErrorCode,
} from '@primis/config';

export const MOBILE_TELEMETRY_EVENT_NAMES = [
  'mobile.render_crash',
  'mobile.render_recovery',
] as const;
export type MobileTelemetryEventName = (typeof MOBILE_TELEMETRY_EVENT_NAMES)[number];

export const MOBILE_RECOVERY_ACTIONS = ['retry', 'home'] as const;
export type MobileRecoveryAction = (typeof MOBILE_RECOVERY_ACTIONS)[number];

/** The complete, intentionally small context surface accepted by telemetry. */
export interface SafeMobileTelemetryContext {
  /** Stable product-owned code such as `sleep_detail`; never a URL or route param. */
  readonly screenCode?: string;
  /** Opaque backend correlation ID, validated by the CU-088 policy. */
  readonly requestId?: string;
}

export interface MobileErrorReport extends SafeMobileTelemetryContext {
  readonly classification: SafeErrorClassification;
  readonly code?: SafeErrorCode;
}

export type MobileTelemetryEvent =
  | ({ readonly event: 'mobile.render_crash' } & MobileErrorReport)
  | ({
      readonly event: 'mobile.render_recovery';
      readonly action: MobileRecoveryAction;
    } & SafeMobileTelemetryContext);

export interface MobileTelemetryTransport {
  send(event: MobileTelemetryEvent): void;
}

export interface MobileTelemetry {
  /** Reports an already-classified error DTO; raw Error objects are not accepted. */
  reportError(report: MobileErrorReport): void;
  /** Reports an allowlisted operational event with bounded safe context. */
  trackEvent(
    event: 'mobile.render_recovery',
    context: SafeMobileTelemetryContext & { readonly action: MobileRecoveryAction },
  ): void;
}

export const NOOP_MOBILE_TELEMETRY_TRANSPORT: MobileTelemetryTransport = {
  send: () => {
    // Local development and tests are silent unless a transport is explicitly injected.
  },
};

const SCREEN_CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,47}$/;

function sanitizeScreenCode(value: unknown): string | undefined {
  const safeValue = sanitizeCorrelationId(value);
  return safeValue !== undefined && SCREEN_CODE_PATTERN.test(safeValue) ? safeValue : undefined;
}

function sanitizeContext(context: SafeMobileTelemetryContext): SafeMobileTelemetryContext {
  const screenCode = sanitizeScreenCode(context.screenCode);
  const requestId = sanitizeCorrelationId(context.requestId);
  return {
    ...(screenCode !== undefined ? { screenCode } : {}),
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

function safelySend(transport: MobileTelemetryTransport, event: MobileTelemetryEvent): void {
  try {
    transport.send(event);
  } catch {
    // Observability must never turn a recoverable UI failure into another crash.
  }
}

/**
 * Converts any thrown value to a fixed, message-free report.
 * Only a valid request ID is read from the thrown value; messages, stacks,
 * causes, props, and custom metadata are never copied.
 */
export function classifyMobileError(
  error: unknown,
  context: SafeMobileTelemetryContext = {},
): MobileErrorReport {
  const classified = classifyError(error);
  let thrownRequestId: unknown;
  try {
    if (typeof error === 'object' && error !== null) {
      thrownRequestId = Reflect.get(error, 'requestId');
    }
  } catch {
    thrownRequestId = undefined;
  }

  const safeContext = sanitizeContext(context);
  const safeThrownRequestId = sanitizeCorrelationId(thrownRequestId);

  return {
    classification: classified.classification,
    ...(classified.code !== undefined ? { code: classified.code } : {}),
    ...safeContext,
    ...(safeContext.requestId === undefined && safeThrownRequestId !== undefined
      ? { requestId: safeThrownRequestId }
      : {}),
  };
}

/** Creates an adapter backed by an injected transport; no vendor or network is implied. */
export function createMobileTelemetry(
  transport: MobileTelemetryTransport = NOOP_MOBILE_TELEMETRY_TRANSPORT,
): MobileTelemetry {
  return {
    reportError(report) {
      const safeContext = sanitizeContext(report);
      const classification = SAFE_ERROR_CLASSIFICATIONS.includes(report.classification)
        ? report.classification
        : 'UnknownError';
      const safeCode = classifyError({ code: report.code }).code;
      safelySend(transport, {
        event: 'mobile.render_crash',
        classification,
        ...(safeCode !== undefined ? { code: safeCode } : {}),
        ...safeContext,
      });
    },
    trackEvent(event, context) {
      if (event !== 'mobile.render_recovery') return;
      if (!MOBILE_RECOVERY_ACTIONS.includes(context.action)) return;
      safelySend(transport, {
        event,
        action: context.action,
        ...sanitizeContext(context),
      });
    },
  };
}

/** App-wide default: a no-op until Phase Z explicitly authorizes a vendor transport. */
export const mobileTelemetry = createMobileTelemetry();
