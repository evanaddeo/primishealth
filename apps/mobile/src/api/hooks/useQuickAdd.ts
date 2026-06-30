/**
 * useQuickAdd — adapter for the quick-add lifestyle / nutrition write-paths (CU-074).
 *
 * Single seam between the QuickAdd bottom sheet and the Phase H write contracts
 * (hydration / caffeine / alcohol / manual macros / digestion / tags). In mock
 * mode (`EXPO_PUBLIC_MOCK_MODE=true`, the default) each POST throws
 * `MockModeError`, which we catch and satisfy from `src/mocks/*` by echoing a
 * schema-valid DTO. A later phase swaps to the live routes with no screen change.
 *
 * Local-first (ADR-008 client side): each successful log optimistically folds the
 * new entry into the cached `lifestyle-day` / `nutrition-day` query via the pure
 * `quickAddModel` folders, so a just-logged value shows instantly. The durable
 * server projection reconciles on the next read.
 *
 * @see apps/mobile/src/features/quickAdd/quickAddModel.ts — request builders + folders
 * @see docs/decisions/ADR-008-manual-input-daily-aggregation-and-freshness.md
 */

import { useCallback } from 'react';

import type {
  AlcoholEntryDto,
  BowelEntryDto,
  CaffeineEntryDto,
  CreateAlcoholRequestDto,
  CreateCaffeineRequestDto,
  CreateDigestionRequestDto,
  CreateHydrationRequestDto,
  CreateNutritionEntryRequestDto,
  CreateTagEventRequestDto,
  CreateTagRequestDto,
  CustomTagDto,
  HydrationEntryDto,
  LifestyleDayResponseDto,
  NutritionDayResponseDto,
  NutritionEntryDto,
  TagEventDto,
} from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { API_ENDPOINTS, MockModeError, apiClient } from '../index';
import {
  getMockLifestyleDay,
  getMockNutritionDay,
  getMockTags,
  mockCreatedAlcohol,
  mockCreatedCaffeine,
  mockCreatedDigestion,
  mockCreatedHydration,
  mockCreatedNutritionEntry,
  mockCreatedTagEvent,
  mockUpsertTag,
} from '../../mocks';
import {
  appendAlcohol,
  appendCaffeine,
  appendHydration,
  appendNutritionEntry,
  resolveLocalDate,
} from '../../features/quickAdd/quickAddModel';

const MOCK_MODE = loadPublicEnv().EXPO_PUBLIC_MOCK_MODE === 'true';

/** The device's IANA timezone, with a UTC fallback for environments without ICU. */
export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function lifestyleKey(localDate: string): readonly [string, string] {
  return ['lifestyle-day', localDate];
}
function nutritionKey(localDate: string): readonly [string, string] {
  return ['nutrition-day', localDate];
}
const TAGS_KEY = ['custom-tags'] as const;

// ── Fetchers (mock-first) ────────────────────────────────────────────────────────

async function fetchLifestyleDay(
  localDate: string,
  timezone: string,
): Promise<LifestyleDayResponseDto> {
  try {
    return await apiClient.get<LifestyleDayResponseDto>(
      `${API_ENDPOINTS.LIFESTYLE}?date=${localDate}`,
    );
  } catch (err) {
    if (err instanceof MockModeError) return getMockLifestyleDay(localDate, timezone);
    throw err;
  }
}

async function fetchNutritionDay(
  localDate: string,
  timezone: string,
): Promise<NutritionDayResponseDto> {
  try {
    return await apiClient.get<NutritionDayResponseDto>(
      `${API_ENDPOINTS.NUTRITION}?date=${localDate}`,
    );
  } catch (err) {
    if (err instanceof MockModeError) return getMockNutritionDay(localDate, timezone);
    throw err;
  }
}

async function fetchTags(): Promise<readonly CustomTagDto[]> {
  try {
    const res = await apiClient.get<{ tags: readonly CustomTagDto[] }>(API_ENDPOINTS.TAGS);
    return res.tags;
  } catch (err) {
    if (err instanceof MockModeError) return getMockTags().tags;
    throw err;
  }
}

// ── Post-or-mock helpers ─────────────────────────────────────────────────────────

async function postOrMock<TReq, TRes>(
  path: string,
  body: TReq,
  mock: (body: TReq) => TRes,
): Promise<TRes> {
  try {
    return await apiClient.post<TRes>(path, body);
  } catch (err) {
    if (err instanceof MockModeError) return mock(body);
    throw err;
  }
}

// ── Controller ────────────────────────────────────────────────────────────────

export interface QuickAddController {
  /** Today's local date (YYYY-MM-DD) resolved in the device timezone. */
  readonly localDate: string;
  readonly timezone: string;
  /** Cached lifestyle roll-up for today (null before first data). */
  readonly lifestyle: LifestyleDayResponseDto | null;
  /** Cached nutrition roll-up for today (null before first data). */
  readonly nutrition: NutritionDayResponseDto | null;
  /** The user's reusable custom tags. */
  readonly tags: readonly CustomTagDto[];
  /** True while any quick-add write is in flight. */
  readonly pending: boolean;

  readonly logWater: (req: CreateHydrationRequestDto) => Promise<boolean>;
  readonly logCaffeine: (req: CreateCaffeineRequestDto) => Promise<boolean>;
  readonly logAlcohol: (req: CreateAlcoholRequestDto) => Promise<boolean>;
  readonly logMacros: (req: CreateNutritionEntryRequestDto) => Promise<boolean>;
  readonly logDigestion: (req: CreateDigestionRequestDto) => Promise<boolean>;
  readonly logTagEvent: (req: CreateTagEventRequestDto) => Promise<boolean>;
  readonly createTag: (req: CreateTagRequestDto) => Promise<CustomTagDto | null>;
}

export function useQuickAdd(): QuickAddController {
  const qc = useQueryClient();
  const timezone = getDeviceTimezone();
  const localDate = resolveLocalDate(new Date(), timezone);

  const lifestyleQuery = useQuery<LifestyleDayResponseDto>({
    queryKey: lifestyleKey(localDate),
    queryFn: () => fetchLifestyleDay(localDate, timezone),
    ...(MOCK_MODE ? { initialData: getMockLifestyleDay(localDate, timezone) } : {}),
  });

  const nutritionQuery = useQuery<NutritionDayResponseDto>({
    queryKey: nutritionKey(localDate),
    queryFn: () => fetchNutritionDay(localDate, timezone),
    ...(MOCK_MODE ? { initialData: getMockNutritionDay(localDate, timezone) } : {}),
  });

  const tagsQuery = useQuery<readonly CustomTagDto[]>({
    queryKey: TAGS_KEY,
    queryFn: fetchTags,
    ...(MOCK_MODE ? { initialData: getMockTags().tags } : {}),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────────

  const hydrationM = useMutation<HydrationEntryDto, Error, CreateHydrationRequestDto>({
    mutationFn: (req) => postOrMock(API_ENDPOINTS.HYDRATION, req, mockCreatedHydration),
    onSuccess: (entry, req) => {
      const key = lifestyleKey(req.localDate);
      const prev = qc.getQueryData<LifestyleDayResponseDto>(key);
      if (prev) qc.setQueryData(key, appendHydration(prev, entry));
    },
  });

  const caffeineM = useMutation<CaffeineEntryDto, Error, CreateCaffeineRequestDto>({
    mutationFn: (req) => postOrMock(API_ENDPOINTS.CAFFEINE, req, mockCreatedCaffeine),
    onSuccess: (entry, req) => {
      const key = lifestyleKey(req.localDate);
      const prev = qc.getQueryData<LifestyleDayResponseDto>(key);
      if (prev) qc.setQueryData(key, appendCaffeine(prev, entry));
    },
  });

  const alcoholM = useMutation<AlcoholEntryDto, Error, CreateAlcoholRequestDto>({
    mutationFn: (req) => postOrMock(API_ENDPOINTS.ALCOHOL, req, mockCreatedAlcohol),
    onSuccess: (entry, req) => {
      const key = lifestyleKey(req.localDate);
      const prev = qc.getQueryData<LifestyleDayResponseDto>(key);
      if (prev) qc.setQueryData(key, appendAlcohol(prev, entry));
    },
  });

  const macrosM = useMutation<NutritionEntryDto, Error, CreateNutritionEntryRequestDto>({
    mutationFn: (req) =>
      postOrMock(API_ENDPOINTS.NUTRITION_ENTRIES, req, mockCreatedNutritionEntry),
    onSuccess: (entry, req) => {
      const key = nutritionKey(req.localDate);
      const prev = qc.getQueryData<NutritionDayResponseDto>(key);
      if (prev) qc.setQueryData(key, appendNutritionEntry(prev, entry));
    },
  });

  const digestionM = useMutation<BowelEntryDto, Error, CreateDigestionRequestDto>({
    mutationFn: (req) => postOrMock(API_ENDPOINTS.DIGESTION, req, mockCreatedDigestion),
  });

  const tagEventM = useMutation<TagEventDto, Error, CreateTagEventRequestDto>({
    mutationFn: (req) => postOrMock(API_ENDPOINTS.TAG_EVENTS, req, mockCreatedTagEvent),
  });

  const createTagM = useMutation<CustomTagDto, Error, CreateTagRequestDto>({
    mutationFn: (req) => postOrMock(API_ENDPOINTS.TAGS, req, mockUpsertTag),
    onSuccess: (tag) => {
      const prev = qc.getQueryData<readonly CustomTagDto[]>(TAGS_KEY) ?? [];
      // De-dupe by tagCode so an upsert of an existing tag does not duplicate it.
      const next = [tag, ...prev.filter((t) => t.tagCode !== tag.tagCode)];
      qc.setQueryData(TAGS_KEY, next);
    },
  });

  // ── Public actions (never throw; resolve to a boolean / DTO) ─────────────────────

  const runBool = useCallback(
    async <TReq, TRes>(mutateAsync: (req: TReq) => Promise<TRes>, req: TReq): Promise<boolean> => {
      try {
        await mutateAsync(req);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const createTag = useCallback(
    async (req: CreateTagRequestDto): Promise<CustomTagDto | null> => {
      try {
        return await createTagM.mutateAsync(req);
      } catch {
        return null;
      }
    },
    [createTagM],
  );

  const pending =
    hydrationM.isPending ||
    caffeineM.isPending ||
    alcoholM.isPending ||
    macrosM.isPending ||
    digestionM.isPending ||
    tagEventM.isPending ||
    createTagM.isPending;

  return {
    localDate,
    timezone,
    lifestyle: lifestyleQuery.data ?? null,
    nutrition: nutritionQuery.data ?? null,
    tags: tagsQuery.data ?? [],
    pending,
    logWater: (req) => runBool(hydrationM.mutateAsync, req),
    logCaffeine: (req) => runBool(caffeineM.mutateAsync, req),
    logAlcohol: (req) => runBool(alcoholM.mutateAsync, req),
    logMacros: (req) => runBool(macrosM.mutateAsync, req),
    logDigestion: (req) => runBool(digestionM.mutateAsync, req),
    logTagEvent: (req) => runBool(tagEventM.mutateAsync, req),
    createTag,
  };
}
