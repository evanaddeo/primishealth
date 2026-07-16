import React from 'react';

import { AiSummaryCard } from '../../../components/AiSummaryCard';

export interface SleepAiSummaryCardProps {
  readonly sourceDate: string;
  readonly testID?: string;
}

export function SleepAiSummaryCard({
  sourceDate,
  testID,
}: SleepAiSummaryCardProps): React.JSX.Element {
  return (
    <AiSummaryCard
      summaryType="sleep"
      surface="sleep_detail"
      sourceDate={sourceDate}
      askButtonTestID="sleep-ask-ai"
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
