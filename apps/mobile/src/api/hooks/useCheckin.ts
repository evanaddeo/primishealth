/**
 * useCheckin — adapter for the daily check-in write-path (CU-074).
 *
 * Single seam between the CheckInScreen and the Phase H `POST /v1/checkins`
 * contract. In mock mode (`EXPO_PUBLIC_MOCK_MODE=true`, the default) the request
 * throws `MockModeError`, which we catch and satisfy from `src/mocks/checkins.ts`
 * by echoing a schema-valid `ManualCheckinDto`. A later phase points the same
 * call site at the live route with no screen changes.
 *
 * The mutation owns no scoring or heavy transforms — the screen builds the
 * request via the pure `checkinModel` and this hook just submits it.
 *
 * @see apps/mobile/src/features/checkin/checkinModel.ts — buildCheckinRequest
 * @see apps/mobile/src/api/hooks/useQuickAdd.ts — sibling write adapter
 */

import { useCallback } from 'react';

import type { CreateCheckinRequestDto, ManualCheckinDto } from '@primis/api-contracts';
import { useMutation } from '@tanstack/react-query';

import { API_ENDPOINTS, MockModeError, apiClient } from '../index';
import { mockCreatedCheckin } from '../../mocks/checkins';

/** Lifecycle of a check-in submission, from the screen's perspective. */
export type CheckinSubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface CheckinController {
  /**
   * Submit a check-in. Resolves to the stored DTO on success, or `null` on a
   * handled error (the controller surfaces `status='error'`); never throws.
   */
  readonly submit: (req: CreateCheckinRequestDto) => Promise<ManualCheckinDto | null>;
  readonly status: CheckinSubmitStatus;
  readonly reset: () => void;
}

async function createCheckin(req: CreateCheckinRequestDto): Promise<ManualCheckinDto> {
  try {
    return await apiClient.post<ManualCheckinDto>(API_ENDPOINTS.CHECKINS, req);
  } catch (err) {
    if (err instanceof MockModeError) return mockCreatedCheckin(req);
    throw err;
  }
}

export function useCheckin(): CheckinController {
  const mutation = useMutation<ManualCheckinDto, Error, CreateCheckinRequestDto>({
    mutationFn: createCheckin,
  });

  const submit = useCallback(
    async (req: CreateCheckinRequestDto): Promise<ManualCheckinDto | null> => {
      try {
        return await mutation.mutateAsync(req);
      } catch {
        return null;
      }
    },
    [mutation],
  );

  const status: CheckinSubmitStatus =
    mutation.status === 'pending'
      ? 'submitting'
      : mutation.status === 'success'
        ? 'success'
        : mutation.status === 'error'
          ? 'error'
          : 'idle';

  return { submit, status, reset: mutation.reset };
}
