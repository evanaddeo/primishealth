import React from 'react';
import { renderWithAct } from '@testing-library/react-native/build/render-act';
import { describe, expect, it, vi } from 'vitest';

import {
  PERFORMANCE_EVENT_CODES,
  createPerformanceMarks,
  type PerformanceMarks,
  type SafePerformanceMeasurement,
} from '../../src/performance/performanceMarks';
import { useRenderTrace } from '../../src/performance/useRenderTrace';

function TraceHarness({ marks }: { readonly marks: PerformanceMarks }) {
  const onRender = useRenderTrace(PERFORMANCE_EVENT_CODES.HOME_CACHED_WARM_RENDER, {
    enabled: true,
    marks,
  });
  return (
    <React.Profiler id="home-warm-test" onRender={onRender}>
      <>cached home</>
    </React.Profiler>
  );
}

describe('useRenderTrace', () => {
  it('emits only the first commit and cleanup does not duplicate it', () => {
    const events: SafePerformanceMeasurement[] = [];
    const marks = createPerformanceMarks({
      enabled: true,
      environment: 'test',
      sink: (event) => events.push(event),
    });
    const view = renderWithAct(<TraceHarness marks={marks} />);

    expect(events).toEqual([
      {
        eventCode: 'home.cached_warm_render',
        durationMs: expect.any(Number),
        outcome: 'completed',
        renderCount: 1,
        environment: 'test',
      },
    ]);

    React.act(() => view.update(<TraceHarness marks={marks} />));
    React.act(() => view.unmount());
    expect(events).toHaveLength(1);
  });

  it('does not record a render when disabled', () => {
    const record = vi.fn();
    const marks: PerformanceMarks = {
      ...createPerformanceMarks({ enabled: false }),
      record,
    };

    function DisabledHarness() {
      const onRender = useRenderTrace(PERFORMANCE_EVENT_CODES.HOME_CACHED_WARM_RENDER, {
        enabled: false,
        marks,
      });
      return (
        <React.Profiler id="disabled-trace" onRender={onRender}>
          <>production home</>
        </React.Profiler>
      );
    }

    const view = renderWithAct(<DisabledHarness />);
    React.act(() => view.unmount());
    expect(record).not.toHaveBeenCalled();
  });
});
