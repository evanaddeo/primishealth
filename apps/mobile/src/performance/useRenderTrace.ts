/** First-commit render tracing with no production Profiler tree (CU-092). */

import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

import {
  isDevPerformanceEnabled,
  performanceMarks,
  type PerformanceEventCode,
  type PerformanceMarks,
} from './performanceMarks';

export interface UseRenderTraceOptions {
  readonly marks?: PerformanceMarks;
  readonly enabled?: boolean;
}

/**
 * Returns a React Profiler callback that emits once for the first committed
 * render. Cleanup prevents any deferred callback from emitting after unmount.
 */
export function useRenderTrace(
  eventCode: PerformanceEventCode,
  options: UseRenderTraceOptions = {},
): React.ProfilerOnRenderCallback {
  const marks = options.marks ?? performanceMarks;
  const enabled = options.enabled ?? isDevPerformanceEnabled();
  const emittedRef = useRef(false);

  const onRender = useCallback<React.ProfilerOnRenderCallback>(
    (_id, _phase, actualDuration) => {
      if (!enabled || emittedRef.current) return;
      emittedRef.current = true;
      marks.record(eventCode, actualDuration, 'completed', 1);
    },
    [enabled, eventCode, marks],
  );

  useEffect(
    () => () => {
      // Prevent any deferred Profiler callback from emitting after unmount.
      emittedRef.current = true;
    },
    [],
  );

  return onRender;
}
