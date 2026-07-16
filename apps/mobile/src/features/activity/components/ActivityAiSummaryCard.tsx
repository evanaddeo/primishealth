import React from 'react';

import { AiSummaryCard } from '../../../components/AiSummaryCard';

export interface ActivityAiSummaryCardProps {
  readonly sourceDate: string;
  readonly testID?: string;
}

export function ActivityAiSummaryCard({
  sourceDate,
  testID,
}: ActivityAiSummaryCardProps): React.JSX.Element {
  return (
    <AiSummaryCard
      summaryType="workout"
      surface="activity_detail"
      sourceDate={sourceDate}
      askButtonTestID="activity-ask-ai"
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
