import React from 'react';

import { StaleDataBanner } from '../../../components/StaleDataBanner';
import type { NutritionBannerVm } from '../nutritionModel';

export interface NutritionBannerProps {
  readonly banner: NutritionBannerVm;
  readonly testID?: string;
  readonly onAction?: () => void;
}

export function NutritionBanner({
  banner,
  testID,
  onAction,
}: NutritionBannerProps): React.JSX.Element {
  return (
    <StaleDataBanner
      body={banner.message}
      {...(onAction === undefined ? {} : { onAction })}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
