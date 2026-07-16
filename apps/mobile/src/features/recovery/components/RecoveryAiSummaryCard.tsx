import React from 'react';

import { AiSummaryCard } from '../../../components/AiSummaryCard';

export interface RecoveryAiSummaryCardProps {
  readonly sourceDate: string;
  readonly testID?: string;
}

export function RecoveryAiSummaryCard({
  sourceDate,
  testID,
}: RecoveryAiSummaryCardProps): React.JSX.Element {
  return (
    <AiSummaryCard
      summaryType="recovery"
      surface="recovery_detail"
      sourceDate={sourceDate}
      askButtonTestID="recovery-ask-ai"
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
