import { describe, expect, it, vi } from 'vitest';

import {
  classifyMobileError,
  createMobileTelemetry,
  mobileTelemetry,
  type MobileTelemetryEvent,
  type MobileTelemetryTransport,
} from '../../src/observability/telemetry';

function captureTelemetry(): {
  events: MobileTelemetryEvent[];
  transport: MobileTelemetryTransport;
} {
  const events: MobileTelemetryEvent[] = [];
  return {
    events,
    transport: { send: (event) => events.push(event) },
  };
}

describe('mobile telemetry privacy boundary', () => {
  it('classifies an error without retaining its message, stack, cause, or custom context', () => {
    const error = Object.assign(new TypeError('HRV 42 for private@example.invalid'), {
      cause: new Error('Bearer private-token'),
      prompt: 'Why was my sleep score low?',
      requestId: 'req-safe-123',
    });

    const report = classifyMobileError(error, { screenCode: 'sleep_detail' });

    expect(report).toEqual({
      classification: 'TypeError',
      screenCode: 'sleep_detail',
      requestId: 'req-safe-123',
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('HRV');
    expect(serialized).not.toContain('private@example.invalid');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('sleep score');
  });

  it('sends only allowlisted, bounded classification metadata', () => {
    const { events, transport } = captureTelemetry();
    const telemetry = createMobileTelemetry(transport);

    telemetry.reportError({
      classification: 'TypeError',
      code: 'TIMEOUT',
      screenCode: 'coach_tab',
      requestId: 'req-safe-456',
      message: 'private note with weight 82kg',
      steps: 12_345,
      userId: 'private-user',
    } as never);

    expect(events).toEqual([
      {
        event: 'mobile.render_crash',
        classification: 'TypeError',
        code: 'TIMEOUT',
        screenCode: 'coach_tab',
        requestId: 'req-safe-456',
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('private');
    expect(JSON.stringify(events)).not.toContain('12345');
    expect(JSON.stringify(events)).not.toContain('82kg');
  });

  it('rejects unsafe screen codes, request IDs, recovery actions, and health breadcrumb attempts', () => {
    const { events, transport } = captureTelemetry();
    const telemetry = createMobileTelemetry(transport);

    telemetry.trackEvent('mobile.render_recovery', {
      action: 'retry',
      screenCode: '/sleep?user=private@example.invalid',
      requestId: 'Bearer private-token',
      breadcrumb: { heartRate: 48 },
      healthValue: 48,
      providerPayload: { steps: 9_000 },
    } as never);
    telemetry.trackEvent('mobile.render_recovery', {
      action: 'reload_with_health_context',
      screenCode: 'sleep_detail',
    } as never);
    telemetry.trackEvent('mobile.render_recovery', {
      action: 'retry',
      screenCode: 'sk-private-token',
    });

    expect(events).toEqual([
      { event: 'mobile.render_recovery', action: 'retry' },
      { event: 'mobile.render_recovery', action: 'retry' },
    ]);
    expect('addBreadcrumb' in telemetry).toBe(false);
    expect(JSON.stringify(events)).not.toMatch(/heart|health|provider|9000|private/i);
  });

  it('is no-op by default and never invokes fetch', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(() =>
      mobileTelemetry.reportError(classifyMobileError(new Error('local-only failure'))),
    ).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('isolates transport failures from app execution', () => {
    const telemetry = createMobileTelemetry({
      send: () => {
        throw new Error('vendor unavailable');
      },
    });

    expect(() => telemetry.reportError({ classification: 'UnknownError' })).not.toThrow();
  });
});
