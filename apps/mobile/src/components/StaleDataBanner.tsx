import React from 'react';

import { DataStatusBanner, type DataStatusBannerProps } from './DataStatusBanner';

export type StaleDataBannerProps = Omit<DataStatusBannerProps, 'state'>;

export function StaleDataBanner(props: StaleDataBannerProps): React.JSX.Element {
  return <DataStatusBanner state="stale_data" {...props} />;
}
