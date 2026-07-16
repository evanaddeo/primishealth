import React from 'react';

import { DataStatusBanner } from '../../../components/DataStatusBanner';
import type { VitalsBannerVm } from '../vitalsModel';

export interface VitalsBannerProps {
  readonly banner: VitalsBannerVm;
  readonly testID?: string;
  readonly onAction?: () => void;
}

export function VitalsBanner({ banner, testID, onAction }: VitalsBannerProps): React.JSX.Element {
  return (
    <DataStatusBanner
      state={
        banner.tone === 'stale'
          ? 'stale_data'
          : banner.tone === 'provider_unavailable'
            ? 'provider_unavailable'
            : 'calculation_failure'
      }
      body={banner.message}
      {...(onAction === undefined ? {} : { onAction })}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
