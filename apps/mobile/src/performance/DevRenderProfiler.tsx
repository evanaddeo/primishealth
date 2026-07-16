import React from 'react';

import { isDevPerformanceEnabled, type PerformanceEventCode } from './performanceMarks';
import { useRenderTrace } from './useRenderTrace';

export interface DevRenderProfilerProps {
  readonly eventCode: PerformanceEventCode;
  readonly children: React.ReactNode;
}

function ActiveRenderProfiler({ eventCode, children }: DevRenderProfilerProps): React.JSX.Element {
  const onRender = useRenderTrace(eventCode);
  return (
    <React.Profiler id={eventCode} onRender={onRender}>
      {children}
    </React.Profiler>
  );
}

/** Production builds return children directly and do not mount React.Profiler. */
export function DevRenderProfiler(props: DevRenderProfilerProps): React.JSX.Element {
  return isDevPerformanceEnabled() ? <ActiveRenderProfiler {...props} /> : <>{props.children}</>;
}
