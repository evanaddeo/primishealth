import React from 'react';

import { DataStatusBanner } from '../../../components/DataStatusBanner';
import type { RecoveryBannerVm } from '../recoveryModel';

export interface RecoveryBannerProps {
  readonly banner: RecoveryBannerVm;
  readonly testID?: string;
  readonly onAction?: () => void;
}

export function RecoveryBanner({
  banner,
  testID,
  onAction,
}: RecoveryBannerProps): React.JSX.Element {
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
