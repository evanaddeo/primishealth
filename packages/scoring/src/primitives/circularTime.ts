/**
 * Circular (wall-clock) time math (CU-051).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §28 (`core/circularTime`),
 * referenced by §10.6 (sleep consistency) and §20.10 (bedtime circadian
 * compatibility). Time-of-day is a value on a 24-hour circle: 23:30 and 00:30 are
 * one hour apart, not 23. Naive timestamp averaging or subtraction is wrong across
 * the midnight boundary, so every bedtime/wake-time calculation MUST route through
 * these helpers.
 *
 * Pure and deterministic. No DB / IO / provider / mobile dependency. All times are
 * "minutes since local midnight" in `[0, 1440)`; callers convert provider/local
 * `HH:MM[:SS]` strings via {@link parseLocalTimeToMinutes}.
 */

/** Minutes in a full day — the modulus for all circular-time math. */
export const MINUTES_PER_DAY = 1440;

/** Half a day — the maximum possible circular distance between two times. */
export const HALF_DAY_MINUTES = MINUTES_PER_DAY / 2;

/**
 * Wrap an arbitrary minute offset into the canonical `[0, 1440)` range.
 *
 * Handles negatives (e.g. `target_wake − cycles − latency` going before midnight)
 * and values past 24h, via true modulo.
 *
 * @param minutes - Any minute offset (may be negative or ≥ 1440).
 * @returns Equivalent minute-of-day in `[0, 1440)`.
 */
export function normalizeMinutes(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * Shortest circular distance between two minute-of-day values.
 *
 * Always in `[0, 720]`: e.g. `circularMinuteDifference(23*60+30, 30) === 60`.
 *
 * @param a - First time, minutes since midnight.
 * @param b - Second time, minutes since midnight.
 * @returns Absolute shortest distance in minutes, `[0, 720]`.
 */
export function circularMinuteDifference(a: number, b: number): number {
  const diff = Math.abs(normalizeMinutes(a) - normalizeMinutes(b));
  return Math.min(diff, MINUTES_PER_DAY - diff);
}

/**
 * Signed shortest circular delta `from → to`, in `(-720, 720]`.
 *
 * Positive means `to` is "later" (clockwise) than `from` by the short way around;
 * negative means earlier. Useful for direction-aware bedtime adjustments.
 *
 * @param from - Reference time, minutes since midnight.
 * @param to - Target time, minutes since midnight.
 * @returns Signed minutes to move from `from` to `to` the short way.
 */
export function signedCircularDifference(from: number, to: number): number {
  let delta = normalizeMinutes(to) - normalizeMinutes(from);
  if (delta > HALF_DAY_MINUTES) delta -= MINUTES_PER_DAY;
  if (delta <= -HALF_DAY_MINUTES) delta += MINUTES_PER_DAY;
  return delta;
}

/**
 * Circular mean of a set of minute-of-day values.
 *
 * Treats each time as a unit vector at angle `t / 1440 · 2π`, averages the
 * vectors, and converts the resultant angle back to minutes. Robust across
 * midnight: the mean of `23:30` and `00:30` is `00:00`, not `12:00` (which naive
 * arithmetic averaging would give).
 *
 * @param minutesValues - Minute-of-day samples.
 * @returns Circular mean in `[0, 1440)`, or null when empty or perfectly
 *   antipodal (no defined mean direction).
 */
export function circularMean(minutesValues: readonly number[]): number | null {
  if (minutesValues.length === 0) return null;
  let sumSin = 0;
  let sumCos = 0;
  for (const m of minutesValues) {
    const angle = (normalizeMinutes(m) / MINUTES_PER_DAY) * 2 * Math.PI;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  }
  // Antipodal / fully dispersed samples cancel out → no defined mean direction.
  if (Math.abs(sumSin) < 1e-9 && Math.abs(sumCos) < 1e-9) return null;
  const meanAngle = Math.atan2(sumSin / minutesValues.length, sumCos / minutesValues.length);
  return normalizeMinutes((meanAngle / (2 * Math.PI)) * MINUTES_PER_DAY);
}

/**
 * Mean resultant length `R` of a set of minute-of-day values, in `[0, 1]`.
 *
 * `R ≈ 1` means tightly clustered times; `R ≈ 0` means widely spread. Underlies
 * the circular standard deviation.
 *
 * @param minutesValues - Minute-of-day samples.
 * @returns `R` in `[0, 1]`, or null when empty.
 */
export function circularResultantLength(minutesValues: readonly number[]): number | null {
  if (minutesValues.length === 0) return null;
  let sumSin = 0;
  let sumCos = 0;
  for (const m of minutesValues) {
    const angle = (normalizeMinutes(m) / MINUTES_PER_DAY) * 2 * Math.PI;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  }
  const n = minutesValues.length;
  return Math.sqrt((sumSin / n) ** 2 + (sumCos / n) ** 2);
}

/**
 * Circular standard deviation of minute-of-day values, expressed in minutes.
 *
 * Uses `σ = sqrt(-2 · ln R)` radians, converted to minutes. A schedule with low
 * dispersion (regular bedtimes) yields a small value; an irregular schedule yields
 * a large one. This is the "regularity" signal behind sleep-consistency scoring.
 *
 * @param minutesValues - Minute-of-day samples.
 * @returns Circular SD in minutes (>= 0), or null when fewer than 2 samples.
 */
export function circularStandardDeviationMinutes(minutesValues: readonly number[]): number | null {
  if (minutesValues.length < 2) return null;
  const r = circularResultantLength(minutesValues);
  if (r == null) return null;
  // Guard the log against R == 0 (fully dispersed) — cap dispersion rather than
  // returning Infinity so downstream banding stays finite.
  const rSafe = Math.max(r, 1e-9);
  const sdRadians = Math.sqrt(-2 * Math.log(rSafe));
  const sdMinutes = (sdRadians / (2 * Math.PI)) * MINUTES_PER_DAY;
  return Math.min(sdMinutes, HALF_DAY_MINUTES);
}

/**
 * Parse a local `HH:MM` or `HH:MM:SS` time-of-day string into minutes since
 * midnight.
 *
 * Intended for the `time`-typed columns of `sleep_daily_features`
 * (`bedtime_local`, `wake_time_local`, …). Returns null on malformed / empty
 * input so callers degrade to `not_enough_data` rather than throwing.
 *
 * @param localTime - Time-of-day string, e.g. `"23:15"` or `"06:45:00"`.
 * @returns Minutes since midnight in `[0, 1440)`, or null when unparseable.
 */
export function parseLocalTimeToMinutes(localTime: string | null | undefined): number | null {
  if (localTime == null) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(localTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] != null ? Number(match[3]) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return normalizeMinutes(hours * 60 + minutes + Math.floor(seconds / 60));
}

/**
 * Format minutes-since-midnight back into a zero-padded `HH:MM` local time.
 *
 * @param minutes - Any minute offset (normalized internally).
 * @returns `HH:MM` string in `[00:00, 23:59]`.
 */
export function minutesToLocalTime(minutes: number): string {
  const normalized = Math.round(normalizeMinutes(minutes)) % MINUTES_PER_DAY;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
