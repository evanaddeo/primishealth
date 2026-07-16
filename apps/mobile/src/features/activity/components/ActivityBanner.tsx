import React from 'react';

import { DataStatusBanner } from '../../../components/DataStatusBanner';
import type { ActivityBannerVm } from '../activityModel';

export interface ActivityBannerProps {
  readonly banner: ActivityBannerVm;
  readonly testID?: string;
  readonly onAction?: () => void;
}

export function ActivityBanner({
  banner,
  testID,
  onAction,
}: ActivityBannerProps): React.JSX.Element {
  return (
    <DataStatusBanner
      state={
        banner.tone === 'stale'
          ? 'stale_data'
          : banner.tone === 'provider_unavailable'
            ? 'provider_unavailable'
            : banner.tone === 'calculation_failure'
              ? 'calculation_failure'
              : 'provisional'
      }
      body={banner.message}
      {...(onAction === undefined ? {} : { onAction })}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
