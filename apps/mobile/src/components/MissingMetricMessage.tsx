import React from 'react';

import type { MissingMetricDto } from '@primis/api-contracts';

import { DataStatusBanner } from './DataStatusBanner';
import {
  dataStateFromMissingMetric,
  resolveMetricLabel,
  resolveMissingMetricBody,
} from './dataStateModel';

export interface MissingMetricMessageProps {
  readonly metric: MissingMetricDto;
  readonly testID?: string;
}

/** Compact required/optional metric explanation; missing values are never zero-filled. */
export function MissingMetricMessage({
  metric,
  testID,
}: MissingMetricMessageProps): React.JSX.Element {
  return (
    <DataStatusBanner
      state={dataStateFromMissingMetric(metric)}
      title={`${resolveMetricLabel(metric.metricCode)} ${metric.isRequired ? 'required' : 'optional'}`}
      body={resolveMissingMetricBody(metric)}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
