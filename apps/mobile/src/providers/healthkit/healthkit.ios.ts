import {
  AuthorizationRequestStatus,
  CategoryValueSleepAnalysis,
  WorkoutTypeIdentifier,
  areObjectTypesAvailableAsync,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  queryWorkoutSamples,
  requestAuthorization as requestNativeAuthorization,
  type ObjectTypeIdentifier,
} from '@kingstinct/react-native-healthkit';
import { loadPublicEnv } from '@primis/config';
import {
  LOCAL_HEALTH_PROVIDER_CODE,
  LOCAL_HEALTH_READ_TYPES,
  type LocalHealthAuthorizationStatus,
  type LocalHealthReadType,
} from '@primis/core-types';

import {
  createUnavailableHealthKitAdapter,
  validateHealthKitReadTypes,
  validateHealthKitReadWindow,
  type HealthKitAdapter,
} from './HealthKitAdapter';
import type {
  HealthKitAuthorizationResult,
  HealthKitCapabilities,
  HealthKitQuantityReadType,
  HealthKitQuantitySample,
  HealthKitReadRequest,
  HealthKitReadResult,
  HealthKitSample,
  HealthKitSleepSample,
  HealthKitSleepStage,
  HealthKitWorkoutSample,
} from './types';

export interface HealthKitAdapterFactoryOptions {
  readonly enabled?: boolean;
}

/**
 * Apple identifiers stay inside the iOS-only module. In particular, HealthKit exposes
 * SDNN rather than RMSSD, so hrv_rmssd remains explicitly unsupported instead of being
 * silently mislabeled. Phase Z must validate any future HRV mapping.
 */
export const HEALTHKIT_READ_IDENTIFIER_BY_TYPE: Readonly<
  Partial<Record<LocalHealthReadType, ObjectTypeIdentifier>>
> = {
  weight: 'HKQuantityTypeIdentifierBodyMass',
  body_fat: 'HKQuantityTypeIdentifierBodyFatPercentage',
  lean_mass: 'HKQuantityTypeIdentifierLeanBodyMass',
  resting_heart_rate: 'HKQuantityTypeIdentifierRestingHeartRate',
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
  workouts: WorkoutTypeIdentifier,
};

export function mapAuthorizationRequestStatus(
  status: AuthorizationRequestStatus,
): LocalHealthAuthorizationStatus {
  switch (status) {
    case AuthorizationRequestStatus.shouldRequest:
      return 'not_requested';
    case AuthorizationRequestStatus.unnecessary:
      return 'requested';
    case AuthorizationRequestStatus.unknown:
      return 'error';
  }
}

function mappedIdentifiers(
  readTypes: readonly LocalHealthReadType[],
): readonly ObjectTypeIdentifier[] {
  return readTypes.flatMap((readType) => {
    const identifier = HEALTHKIT_READ_IDENTIFIER_BY_TYPE[readType];
    return identifier === undefined ? [] : [identifier];
  });
}

function boundedLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 100, 1), 100);
}

function quantitySample(
  readType: HealthKitQuantityReadType,
  sample: {
    readonly uuid: string;
    readonly startDate: Date;
    readonly endDate: Date;
    readonly quantity: number;
  },
  unit: HealthKitQuantitySample['unit'],
): HealthKitQuantitySample {
  return {
    kind: 'quantity',
    readType,
    sourceRecordId: sample.uuid,
    startTimeUtc: sample.startDate.toISOString(),
    endTimeUtc: sample.endDate.toISOString(),
    value: sample.quantity,
    unit,
  };
}

function mapSleepStage(value: CategoryValueSleepAnalysis): HealthKitSleepStage {
  switch (value) {
    case CategoryValueSleepAnalysis.inBed:
      return 'in_bed';
    case CategoryValueSleepAnalysis.awake:
      return 'awake';
    case CategoryValueSleepAnalysis.asleepUnspecified:
      return 'asleep';
    case CategoryValueSleepAnalysis.asleepCore:
      return 'core';
    case CategoryValueSleepAnalysis.asleepDeep:
      return 'deep';
    case CategoryValueSleepAnalysis.asleepREM:
      return 'rem';
    default:
      return 'unknown';
  }
}

async function readNativeType(
  readType: LocalHealthReadType,
  request: HealthKitReadRequest,
): Promise<readonly HealthKitSample[]> {
  const filter = {
    date: {
      startDate: new Date(request.window.startTimeUtc),
      endDate: new Date(request.window.endTimeUtc),
      strictStartDate: true,
      strictEndDate: true,
    },
  };
  const limit = boundedLimit(request.limit);

  switch (readType) {
    case 'weight':
      return (
        await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
          filter,
          limit,
          ascending: true,
          unit: 'kg',
        })
      ).map((sample) => quantitySample(readType, sample, 'kg'));
    case 'body_fat':
      return (
        await queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage', {
          filter,
          limit,
          ascending: true,
          unit: '%',
        })
      ).map((sample) => quantitySample(readType, sample, 'percent'));
    case 'lean_mass':
      return (
        await queryQuantitySamples('HKQuantityTypeIdentifierLeanBodyMass', {
          filter,
          limit,
          ascending: true,
          unit: 'kg',
        })
      ).map((sample) => quantitySample(readType, sample, 'kg'));
    case 'resting_heart_rate':
      return (
        await queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', {
          filter,
          limit,
          ascending: true,
          unit: 'count/min',
        })
      ).map((sample) => quantitySample(readType, sample, 'bpm'));
    case 'sleep':
      return (
        await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
          filter,
          limit,
          ascending: true,
        })
      ).map<HealthKitSleepSample>((sample) => ({
        kind: 'sleep_interval',
        readType,
        sourceRecordId: sample.uuid,
        startTimeUtc: sample.startDate.toISOString(),
        endTimeUtc: sample.endDate.toISOString(),
        stage: mapSleepStage(sample.value),
      }));
    case 'workouts':
      return (
        await queryWorkoutSamples({
          filter,
          limit,
          ascending: true,
        })
      ).map<HealthKitWorkoutSample>((sample) => ({
        kind: 'workout',
        readType,
        sourceRecordId: sample.uuid,
        startTimeUtc: sample.startDate.toISOString(),
        endTimeUtc: sample.endDate.toISOString(),
        workoutActivityType: String(sample.workoutActivityType),
        durationSeconds: sample.duration.quantity,
      }));
    case 'hrv_rmssd':
      return [];
  }
}

export class NativeHealthKitAdapter implements HealthKitAdapter {
  readonly providerCode = LOCAL_HEALTH_PROVIDER_CODE;

  private authorizationStatus: LocalHealthAuthorizationStatus = 'not_requested';
  private requestedReadTypes: readonly LocalHealthReadType[] = [];
  private readableReadTypes: readonly LocalHealthReadType[] = [];

  async getCapabilities(): Promise<HealthKitCapabilities> {
    try {
      if (!(await isHealthDataAvailableAsync())) {
        return createUnavailableHealthKitAdapter({
          featureEnabled: true,
          platform: 'ios',
          reason: 'device_unavailable',
        }).getCapabilities();
      }

      const identifiers = mappedIdentifiers(LOCAL_HEALTH_READ_TYPES);
      const availability = await areObjectTypesAvailableAsync([...identifiers]);
      const requestStatus = await getRequestStatusForAuthorization({ toRead: identifiers });
      if (this.authorizationStatus === 'not_requested' || this.authorizationStatus === 'error') {
        this.authorizationStatus = mapAuthorizationRequestStatus(requestStatus);
      }
      this.readableReadTypes = LOCAL_HEALTH_READ_TYPES.filter((readType) => {
        const identifier = HEALTHKIT_READ_IDENTIFIER_BY_TYPE[readType];
        return identifier !== undefined && availability[identifier] === true;
      });

      return {
        providerCode: this.providerCode,
        platform: 'ios',
        platformSupport: 'supported',
        featureEnabled: true,
        deviceCapability: 'available',
        authorizationStatus: this.authorizationStatus,
        requestedReadTypes: this.requestedReadTypes,
        readableReadTypes: this.readableReadTypes,
        unavailableReadTypes: LOCAL_HEALTH_READ_TYPES.filter(
          (readType) => !this.readableReadTypes.includes(readType),
        ).map((readType) => ({
          readType,
          reason:
            HEALTHKIT_READ_IDENTIFIER_BY_TYPE[readType] === undefined
              ? ('unsupported_type' as const)
              : ('device_unavailable' as const),
        })),
        requiresDevelopmentClient: true,
      };
    } catch {
      return {
        providerCode: this.providerCode,
        platform: 'ios',
        platformSupport: 'supported',
        featureEnabled: true,
        deviceCapability: 'unknown',
        authorizationStatus: 'error',
        requestedReadTypes: this.requestedReadTypes,
        readableReadTypes: [],
        unavailableReadTypes: LOCAL_HEALTH_READ_TYPES.map((readType) => ({
          readType,
          reason: 'native_error',
        })),
        requiresDevelopmentClient: true,
      };
    }
  }

  async requestAuthorization(
    readTypes: readonly LocalHealthReadType[] = LOCAL_HEALTH_READ_TYPES,
  ): Promise<HealthKitAuthorizationResult> {
    const selected = validateHealthKitReadTypes(readTypes);
    const capabilities = await this.getCapabilities();
    if (capabilities.deviceCapability !== 'available') {
      return {
        ok: false,
        error: {
          code: 'DEVICE_UNAVAILABLE',
          message: 'Apple Health data is not available on this device.',
          retryable: false,
        },
      };
    }

    const supported = selected.filter((readType) => this.readableReadTypes.includes(readType));
    const unavailable = selected.filter((readType) => !supported.includes(readType));
    const identifiers = mappedIdentifiers(supported);
    if (identifiers.length === 0) {
      return {
        ok: false,
        error: {
          code: 'UNSUPPORTED_READ_TYPE',
          message: 'None of the selected Apple Health data types are available.',
          retryable: false,
        },
      };
    }

    this.authorizationStatus = 'request_in_progress';
    try {
      const completed = await requestNativeAuthorization({ toRead: identifiers });
      if (!completed) throw new Error('authorization_not_completed');
      this.authorizationStatus = 'requested';
      this.requestedReadTypes = supported;
      return {
        ok: true,
        status: 'requested',
        requestedReadTypes: supported,
        unavailableReadTypes: unavailable,
      };
    } catch {
      this.authorizationStatus = 'error';
      return {
        ok: false,
        error: {
          code: 'AUTHORIZATION_FAILED',
          message: 'Apple Health permission did not finish. Try again from Settings.',
          retryable: true,
        },
      };
    }
  }

  async readSamples(request: HealthKitReadRequest): Promise<HealthKitReadResult> {
    const windowError = validateHealthKitReadWindow(request);
    if (windowError !== null) return { ok: false, error: windowError };
    if (!['requested', 'limited_or_no_data', 'available'].includes(this.authorizationStatus)) {
      return {
        ok: false,
        error: {
          code: 'AUTHORIZATION_REQUIRED',
          message: 'Choose Connect Apple Health before reading data.',
          retryable: false,
        },
      };
    }

    const selected = validateHealthKitReadTypes(request.readTypes);
    const readable = selected.filter(
      (readType) =>
        this.requestedReadTypes.includes(readType) && this.readableReadTypes.includes(readType),
    );
    const unavailable = selected.filter((readType) => !readable.includes(readType));
    try {
      const records = (
        await Promise.all(readable.map((readType) => readNativeType(readType, request)))
      )
        .flat()
        .slice(0, boundedLimit(request.limit));
      this.authorizationStatus = records.length === 0 ? 'limited_or_no_data' : 'available';
      return {
        ok: true,
        status: this.authorizationStatus,
        records,
        unavailableReadTypes: unavailable,
      };
    } catch {
      this.authorizationStatus = 'error';
      return {
        ok: false,
        error: {
          code: 'READ_FAILED',
          message: 'Apple Health data could not be read. Try again later.',
          retryable: true,
        },
      };
    }
  }
}

export function createHealthKitAdapter(
  options: HealthKitAdapterFactoryOptions = {},
): HealthKitAdapter {
  const enabled = options.enabled ?? loadPublicEnv().EXPO_PUBLIC_HEALTHKIT_ENABLED === 'true';
  return enabled
    ? new NativeHealthKitAdapter()
    : createUnavailableHealthKitAdapter({
        featureEnabled: false,
        platform: 'ios',
        reason: 'feature_disabled',
      });
}
